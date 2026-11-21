// How a document is stored: ProseMirror's own JSON, with nothing lost when
// the schema doesn't know a part. On load, unknown types become placeholders
// and unknown attributes go into the catch-all; on save both are written
// back exactly as they were read.

import { Fragment, type Mark, type Node, type Schema } from 'prosemirror-model';
import { CATCH_ALL, DATA_NODE, UNKNOWN_BLOCK, UNKNOWN_CONTAINER, UNKNOWN_INLINE, UNKNOWN_MARK, type StoredJson } from './parts.js';

export interface LoadedDocument {
  doc: Node;
  // Set when the stored document doesn't fit the schema: the document
  // opens read-only with this shown.
  error: string | null;
}

export function documentFromJson(schema: Schema, json: StoredJson): LoadedDocument {
  const doc = schema.topNodeType.create(splitAttrs(schema.topNodeType.spec.attrs, json.attrs), children(schema, withDataNode(schema, json), false, false));
  try {
    doc.check();
    return { doc, error: null };
  } catch (err) {
    return { doc, error: err instanceof Error ? err.message : String(err) };
  }
}

export function documentToJson(doc: Node): StoredJson {
  return nodeToJson(doc);
}

// A stored document ends with its data node. A file from before it existed
// has the modules' data as its trailing blocks: known data types, and
// unknown types (their group is lost), which move into a data node.
function withDataNode(schema: Schema, json: StoredJson): StoredJson {
  const content = json.content ?? [];
  if (content.at(-1)?.type === DATA_NODE) return json;
  let n = content.length;
  const isData = (c: StoredJson) => {
    const type = schema.nodes[c.type];
    return type ? (type.spec.group ?? '').split(' ').includes('module_data') : true;
  };
  while (n > 1 && isData(content[n - 1]!)) n--;
  return { ...json, content: [...content.slice(0, n), { type: DATA_NODE, content: content.slice(n) }] };
}

function children(schema: Schema, json: StoredJson, inline: boolean, data: boolean): Fragment {
  return Fragment.fromArray((json.content ?? []).map((c) => nodeFromJson(schema, c, inline, data)));
}

// `data`: inside the data node, where an unknown block stays opaque.
function nodeFromJson(schema: Schema, json: StoredJson, inline: boolean, data: boolean): Node {
  const type = schema.nodes[json.type];
  const placeholder = () => schema.nodes[inline ? UNKNOWN_INLINE : UNKNOWN_BLOCK]!.create({ json });
  if (!type && !inline && !data && holdsBlocks(schema, json)) {
    const { content: _content, ...rest } = json;
    return schema.nodes[UNKNOWN_CONTAINER]!.create({ json: rest }, children(schema, json, false, false));
  }
  if (!type || type.name === UNKNOWN_BLOCK || type.name === UNKNOWN_INLINE || type.name === UNKNOWN_CONTAINER) return placeholder();
  try {
    if (type.isText) return schema.text(json.text ?? '', marksFromJson(schema, json.marks));
    return type.create(
      splitAttrs(type.spec.attrs, json.attrs),
      children(schema, json, type.inlineContent, data || type.name === DATA_NODE),
      marksFromJson(schema, json.marks),
    );
  } catch {
    // Attributes the type can't take (a required one missing): keep it whole.
    return placeholder();
  }
}

// Whether a block of an unknown type holds blocks: it has content, none of
// it text or a known inline node, and some child is a known block or itself
// holds blocks. (A child of unknown type with no such sibling could be an
// inline node, so it doesn't decide.)
function holdsBlocks(schema: Schema, json: StoredJson): boolean {
  const content = json.content ?? [];
  if (!content.length) return false;
  let block = false;
  for (const c of content) {
    const type = schema.nodes[c.type];
    if (type) {
      if (type.isText || type.isInline) return false;
      if (type.name !== UNKNOWN_BLOCK && type.name !== UNKNOWN_INLINE && type.name !== UNKNOWN_CONTAINER) block = true;
    } else if (holdsBlocks(schema, c)) block = true;
  }
  return block;
}

function marksFromJson(schema: Schema, json: StoredJson[] | undefined): Mark[] {
  let marks: readonly Mark[] = [];
  for (const m of json ?? []) {
    const type = schema.marks[m.type];
    let mark: Mark;
    try {
      if (!type || type.name === UNKNOWN_MARK) throw new Error('unknown');
      mark = type.create(splitAttrs(type.spec.attrs, m.attrs));
    } catch {
      mark = schema.marks[UNKNOWN_MARK]!.create({ json: m });
    }
    marks = mark.addToSet(marks);
  }
  return [...marks];
}

// Known attributes stay; the rest go into the catch-all.
function splitAttrs(
  known: Record<string, unknown> | undefined,
  attrs: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (known && k in known && k !== CATCH_ALL) out[k] = v;
    else extra[k] = v;
  }
  if (Object.keys(extra).length) out[CATCH_ALL] = extra;
  return out;
}

function nodeToJson(node: Node): StoredJson {
  if (node.type.name === UNKNOWN_CONTAINER) {
    const json: StoredJson = { ...(node.attrs.json as StoredJson), content: [] };
    node.content.forEach((c) => json.content!.push(nodeToJson(c)));
    return json;
  }
  if (node.type.name === UNKNOWN_BLOCK || node.type.name === UNKNOWN_INLINE) return node.attrs.json as StoredJson;
  const json: StoredJson = { type: node.type.name };
  if (node.isText) json.text = node.text!;
  const attrs = joinAttrs(node.attrs);
  if (attrs) json.attrs = attrs;
  if (node.content.size) {
    json.content = [];
    node.content.forEach((c) => json.content!.push(nodeToJson(c)));
  }
  if (node.marks.length) json.marks = node.marks.map(markToJson);
  return json;
}

function markToJson(mark: Mark): StoredJson {
  if (mark.type.name === UNKNOWN_MARK) return mark.attrs.json as StoredJson;
  const json: StoredJson = { type: mark.type.name };
  const attrs = joinAttrs(mark.attrs);
  if (attrs) json.attrs = attrs;
  return json;
}

function joinAttrs(attrs: Record<string, unknown>): Record<string, unknown> | undefined {
  const { [CATCH_ALL]: extra, ...rest } = attrs;
  const out = { ...rest, ...(extra as Record<string, unknown> | null) };
  return Object.keys(out).length ? out : undefined;
}

// The same document under a new schema, through the normal load path:
// newly unknown types become placeholders, returning ones are restored.
export function moveToSchema(doc: Node, schema: Schema): LoadedDocument {
  return documentFromJson(schema, documentToJson(doc));
}

// A new, empty document: one paragraph and the data node.
export function emptyDocument(schema: Schema): Node {
  return documentFromJson(schema, { type: 'doc', content: [{ type: 'paragraph' }] }).doc;
}
