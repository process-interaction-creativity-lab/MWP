// A module's `help.md`, read into blocks the help dialog draws. The file is
// a small subset of Markdown: `##` and `###` headings, paragraphs, `-` and
// `1.` lists (one level; an indented line continues its item), and inline
// **bold**, *italic*, `code` and [links](https://…). The `#` title line is
// dropped: the dialog names the module itself.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: Inline[] }
  | { kind: 'italic'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] };

export type Block =
  | { kind: 'heading'; level: 2 | 3; text: Inline[] }
  | { kind: 'paragraph'; text: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] };

export function parseHelp(markdown: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: 'paragraph', text: parseInline(para.join(' ')) });
    if (list) blocks.push({ kind: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
    para = [];
    list = null;
  };
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = /^(?:([-*])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (line.trim() === '') flush();
    else if (heading) {
      flush();
      const level = heading[1]!.length;
      if (level > 1) blocks.push({ kind: 'heading', level: level as 2 | 3, text: parseInline(heading[2]!) });
    } else if (item) {
      const ordered = item[1] === undefined;
      if (para.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(item[3]!);
    } else if (list && /^\s/.test(line)) list.items[list.items.length - 1] += ' ' + line.trim();
    else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

const INLINE = /\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) out.push({ kind: 'text', text: text.slice(at, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'bold', children: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ kind: 'italic', children: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ kind: 'code', text: m[3] });
    else out.push({ kind: 'link', href: m[5]!, children: parseInline(m[4]!) });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) });
  return out;
}
