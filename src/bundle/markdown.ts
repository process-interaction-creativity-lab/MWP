// A starter document written as Markdown, turned into the stored document
// JSON (core/document-json.ts) at build time. Only what a short tutorial or
// excerpt needs: headings (`#`..`######`), paragraphs (lines up to a blank
// line), bullet (`-`, `*`) and numbered (`1.`) lists of one-line items,
// `---` for a rule, and inline **bold**, *italic* (or _italic_) and `code`.
// Anything else is paragraph text, as written.

import type { StoredJson } from '../core/parts.ts';

export function markdownToDoc(markdown: string): StoredJson {
  const blocks: StoredJson[] = [];
  let paragraph: string[] = [];
  // Set and cleared by endList too, which TypeScript's narrowing can't see.
  let list = null as { type: 'bullet_list' | 'ordered_list'; items: StoredJson[] } | null;

  const endParagraph = () => {
    if (paragraph.length) blocks.push(textBlock('paragraph', paragraph.join(' ')));
    paragraph = [];
  };
  const endList = () => {
    if (list) blocks.push({ type: list.type, content: list.items });
    list = null;
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const item = /^(?:([-*])|(\d+)\.)\s+(.*)$/.exec(line);
    if (!line) {
      endParagraph();
      endList();
    } else if (heading) {
      endParagraph();
      endList();
      blocks.push({ ...textBlock('heading', heading[2]!), attrs: { level: heading[1]!.length } });
    } else if (/^(-{3,}|\*{3,})$/.test(line)) {
      endParagraph();
      endList();
      blocks.push({ type: 'horizontal_rule' });
    } else if (item && !paragraph.length) {
      const type = item[1] ? 'bullet_list' : 'ordered_list';
      if (list?.type !== type) endList();
      list ??= { type, items: [] };
      list.items.push({ type: 'list_item', content: [textBlock('paragraph', item[3]!)] });
    } else {
      endList();
      paragraph.push(line);
    }
  }
  endParagraph();
  endList();
  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] };
}

function textBlock(type: string, text: string): StoredJson {
  const content = inline(text);
  return content.length ? { type, content } : { type };
}

// Marks don't nest here: `**a *b* c**` is bold with literal asterisks.
const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|(?<![\w])_(.+?)_(?![\w])|`(.+?)`/g;

function inline(text: string): StoredJson[] {
  const out: StoredJson[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) out.push({ type: 'text', text: text.slice(at, m.index) });
    const [mark, inner] = m[1] ? ['strong', m[1]] : m[2] ? ['em', m[2]] : m[3] ? ['em', m[3]] : ['code', m[4]!];
    out.push({ type: 'text', text: inner, marks: [{ type: mark }] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ type: 'text', text: text.slice(at) });
  return out;
}
