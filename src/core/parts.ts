// Document parts: the node types, mark types and attributes modules declare
// as plain exports. The schema is the base types plus every installed
// module's parts, plus what the host adds so no stored data is lost:
//
// - every type gets a catch-all attribute holding the attributes the schema
//   doesn't know, written back unchanged on save;
// - a node or mark whose type isn't in the schema (its module isn't
//   installed) becomes an opaque placeholder keeping its original JSON,
//   unless it holds blocks: then it is a plain container whose children
//   show and are edited, and its own type and attributes are kept.

import { Schema, type AttributeSpec, type DOMOutputSpec, type MarkSpec, type NodeSpec, type TagParseRule, type StyleParseRule } from 'prosemirror-model';

type ParseRule = TagParseRule | StyleParseRule;
import type { AttributeContribution, ModuleExports } from 'mwps';
import { baseMarks, baseNodes } from './schema.js';

export const CATCH_ALL = 'unknown_attrs';
export const UNKNOWN_BLOCK = 'unknown_block';
export const UNKNOWN_CONTAINER = 'unknown_container';
export const DATA_NODE = 'mwps_data';
export const UNKNOWN_INLINE = 'unknown_inline';
export const UNKNOWN_MARK = 'unknown_mark';

const HOST_NAMES = new Set([CATCH_ALL, UNKNOWN_BLOCK, UNKNOWN_CONTAINER, DATA_NODE, UNKNOWN_INLINE, UNKNOWN_MARK]);

export interface ModuleParts {
  id: string;
  nodes: Record<string, NodeSpec>;
  marks: Record<string, MarkSpec>;
  attrs: readonly AttributeContribution[];
}

export function partsOf(id: string, exports: ModuleExports): ModuleParts {
  return { id, nodes: exports.nodes ?? {}, marks: exports.marks ?? {}, attrs: exports.attrs ?? [] };
}

export function hasParts(p: ModuleParts): boolean {
  return Object.keys(p.nodes).length > 0 || Object.keys(p.marks).length > 0 || p.attrs.length > 0;
}

// Equal parts mean a code-only update: plain data compared as JSON,
// functions by their source text (a reload makes new function objects).
export function sameParts(a: ModuleParts, b: ModuleParts): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(p: ModuleParts): string {
  return JSON.stringify({ nodes: p.nodes, marks: p.marks, attrs: p.attrs }, (_key, value: unknown) =>
    typeof value === 'function' ? `fn:${value.toString()}` : value instanceof RegExp ? `re:${value}` : value,
  );
}

// Why `candidate` can't join `installed`, or null if it can. Checks names
// and clashes, then that ProseMirror accepts the resulting schema.
export function refusal(installed: readonly ModuleParts[], candidate: ModuleParts): string | null {
  const owners = new Map<string, string>();
  for (const name of [...Object.keys(baseNodes), ...Object.keys(baseMarks)]) owners.set(name, 'the base schema');
  for (const p of installed) for (const name of [...Object.keys(p.nodes), ...Object.keys(p.marks)]) owners.set(name, p.id);

  for (const name of [...Object.keys(candidate.nodes), ...Object.keys(candidate.marks)]) {
    if (!/^\w+$/.test(name)) return `type name "${name}" must be word characters only`;
    if (HOST_NAMES.has(name)) return `type name "${name}" is reserved by the host`;
    const owner = owners.get(name);
    if (owner) return `type name "${name}" is already used by ${owner}`;
  }
  for (const [name, spec] of Object.entries(candidate.nodes)) {
    if ((spec.group ?? '').split(' ').includes('block') && !spec.isolating) {
      return `block type "${name}" must be isolating: without it Backspace, Delete and joins at its edges would pull its content into the writing's paragraphs, or theirs into it (set \`isolating: true\`)`;
    }
  }

  const specs: Record<string, NodeSpec | MarkSpec> = { ...baseNodes, ...baseMarks };
  for (const p of [...installed, candidate]) Object.assign(specs, p.nodes, p.marks);
  const attrOwners = new Map<string, string>();
  for (const p of installed) for (const a of p.attrs) for (const t of a.types) attrOwners.set(`${t}.${a.name}`, p.id);
  for (const a of candidate.attrs) {
    if (!/^\w+$/.test(a.name)) return `attribute name "${a.name}" must be word characters only`;
    if (a.name === CATCH_ALL) return `attribute name "${a.name}" is reserved by the host`;
    for (const t of a.types) {
      if (!(t in baseNodes) && !(t in baseMarks)) {
        return `attribute "${a.name}" targets ${t}, which isn't a base type; modules add attributes only to base types (their own types declare theirs in the spec)`;
      }
      const owner = attrOwners.get(`${t}.${a.name}`);
      if (owner) return `attribute "${a.name}" on ${t} is already contributed by ${owner}`;
      const spec = specs[t];
      if (spec?.attrs && a.name in spec.attrs) return `attribute "${a.name}" already exists on ${t}`;
    }
  }

  try {
    buildSchema([...installed, candidate]);
  } catch (err) {
    return `its parts don't make a valid schema: ${err instanceof Error ? err.message : String(err)}`;
  }
  return null;
}

// Base types first, so `paragraph` stays the default block; module types in
// install order; placeholders after. Mark order is ProseMirror's mark rank.
export function buildSchema(parts: readonly ModuleParts[]): Schema {
  const nodes: Record<string, NodeSpec> = { ...baseNodes };
  const marks: Record<string, MarkSpec> = { ...baseMarks };
  for (const p of parts) {
    Object.assign(nodes, p.nodes);
    Object.assign(marks, p.marks);
    // A module's block in the writing carries its owner, for the frame the
    // host draws around it.
    for (const [name, spec] of Object.entries(p.nodes)) {
      if (inGroup(spec, 'block')) nodes[name] = { ...spec, [OWNER]: p.id };
    }
  }
  // Contributions target base types only (checked at install).
  const added = new Map<string, string[]>();
  for (const p of parts) {
    for (const a of p.attrs) {
      for (const t of a.types) {
        if (nodes[t]) nodes[t] = withAttr(nodes[t], a.name, a.spec);
        else if (marks[t]) marks[t] = withAttr(marks[t], a.name, a.spec);
        added.set(t, [...(added.get(t) ?? []), a.name]);
      }
    }
  }

  // Contributed attributes and the catch-all travel through the DOM too, so
  // copy and paste keep them as save and undo do.
  for (const [name, spec] of Object.entries(nodes)) {
    if (name !== 'text') nodes[name] = carried(withAttr(spec, CATCH_ALL, { default: null }), [...(added.get(name) ?? []), CATCH_ALL]);
  }
  for (const [name, spec] of Object.entries(marks)) {
    marks[name] = carried(withAttr(spec, CATCH_ALL, { default: null }), [...(added.get(name) ?? []), CATCH_ALL]);
  }

  // Module data never joins or lifts across its edges.
  for (const [name, spec] of Object.entries(nodes)) {
    if (isModuleData(spec)) nodes[name] = { ...spec, isolating: true };
  }

  const text = nodes.text!;
  delete nodes.text;
  return new Schema({
    nodes: { ...nodes, [UNKNOWN_BLOCK]: unknownNode(false), [UNKNOWN_CONTAINER]: unknownContainer, [DATA_NODE]: dataNode, [UNKNOWN_INLINE]: unknownNode(true), text },
    marks: { ...marks, [UNKNOWN_MARK]: unknownMark },
  });
}

const inGroup = (spec: NodeSpec, group: string) => (spec.group ?? '').split(' ').includes(group);
const isModuleData = (spec: NodeSpec) => inGroup(spec, 'module_data');

/** The spec field naming the module that added a block type to the writing. */
export const OWNER = 'mwpsOwner';

function withAttr<S extends NodeSpec | MarkSpec>(spec: S, name: string, attr: AttributeSpec): S {
  return { ...spec, attrs: { ...spec.attrs, [name]: attr } };
}

const dataName = (attr: string) => `data-mwps-${attr}`;

// Writes `names` into what `toDOM` draws as `data-mwps-*` attributes (JSON,
// left out at their default) and reads them back in every tag rule.
// Style rules parse a string, not an element, so they can't carry them.
function carried<S extends NodeSpec | MarkSpec>(spec: S, names: readonly string[]): S {
  const defaults = spec.attrs as Record<string, AttributeSpec>;
  const written = (attrs: Record<string, unknown>) => {
    const out: Record<string, string> = {};
    for (const n of names) {
      const json = JSON.stringify(attrs[n]);
      if ('default' in defaults[n]! && json === JSON.stringify(defaults[n]!.default)) continue;
      out[dataName(n)] = json;
    }
    return out;
  };
  const toDOM = spec.toDOM as ((x: { attrs: Record<string, unknown> }, ...rest: unknown[]) => DOMOutputSpec) | undefined;
  const parseDOM = spec.parseDOM as readonly ParseRule[] | undefined;
  return {
    ...spec,
    toDOM: toDOM && ((x: { attrs: Record<string, unknown> }, ...rest: unknown[]) => withDOMAttrs(toDOM(x, ...rest), written(x.attrs))),
    parseDOM: parseDOM?.map((rule) => {
      if (rule.tag === undefined) return rule;
      const fixed = rule.attrs;
      const own = rule.getAttrs as ((dom: HTMLElement) => Record<string, unknown> | false | null | undefined) | undefined;
      return {
        ...rule,
        getAttrs: (dom: HTMLElement) => {
          const attrs = own ? own(dom) : fixed;
          if (attrs === false) return false;
          const out = { ...attrs };
          for (const n of names) {
            const json = dom.getAttribute(dataName(n));
            if (json !== null) out[n] = JSON.parse(json) as unknown;
          }
          return out;
        },
      };
    }),
  };
}

function withDOMAttrs(out: DOMOutputSpec, attrs: Record<string, string>): DOMOutputSpec {
  if (Object.keys(attrs).length === 0) return out;
  const element = (out as { nodeType?: number }).nodeType === 1 ? (out as HTMLElement) : (out as { dom?: HTMLElement }).dom;
  if (element?.nodeType === 1) {
    for (const [k, v] of Object.entries(attrs)) element.setAttribute(k, v);
    return out;
  }
  if (!Array.isArray(out)) return out;
  const [tag, second, ...rest] = out as unknown[];
  const isAttrs = second !== null && typeof second === 'object' && !Array.isArray(second) && !('nodeType' in second);
  return (isAttrs ? [tag, { ...(second as object), ...attrs }, ...rest] : [tag, attrs, ...out.slice(1)]) as unknown as DOMOutputSpec;
}

// What the writer sees in place of a part whose module isn't installed: the
// type's name and its text, read-only.
function unknownNode(inline: boolean): NodeSpec {
  const tag = inline ? 'span' : 'div';
  return {
    // A missing module's data stays where it was, in the data node.
    group: inline ? 'inline' : 'block module_data',
    inline,
    atom: true,
    selectable: true,
    attrs: { json: {} },
    toDOM: (node) => {
      const json = node.attrs.json as StoredJson;
      return [
        tag,
        { class: 'mwps-unknown', 'data-type': String(json.type), title: `${json.type}: its module isn't installed` },
        textOfJson(json) || `${json.type}`,
      ];
    },
  };
}

// The document's last child: where the modules' data lives, apart from the
// writing by position, not by guess.
const dataNode: NodeSpec = {
  content: 'module_data*',
  isolating: true,
  toDOM: () => ['div', { class: 'mwps-data' }, 0],
};

// A missing module's block that holds blocks: its children are the writing's
// to edit. `json` is the block as stored, less its content.
const unknownContainer: NodeSpec = {
  group: 'block',
  content: 'block+',
  isolating: true,
  attrs: { json: {} },
  toDOM: (node) => ['div', { class: 'mwps-unknown-container', 'data-type': String((node.attrs.json as StoredJson).type) }, 0],
};

const unknownMark: MarkSpec = {
  attrs: { json: {} },
  excludes: '',
  toDOM: (mark) => ['span', { class: 'mwps-unknown-mark', 'data-type': String((mark.attrs.json as StoredJson).type) }, 0],
};

export interface StoredJson {
  type: string;
  attrs?: Record<string, unknown>;
  content?: StoredJson[];
  marks?: StoredJson[];
  text?: string;
}

function textOfJson(json: StoredJson): string {
  return json.text ?? (json.content ?? []).map(textOfJson).join(' ');
}
