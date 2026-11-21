// The base types every document may use, whatever modules are installed.
// Installed modules' parts are added to these by buildSchema (parts.ts).

import type { DOMOutputSpec, MarkSpec, NodeSpec } from 'prosemirror-model';

const blockAttrs = {
  align: { default: null as string | null },
  indent: { default: 0 },
};

function blockDOMAttrs(attrs: Record<string, unknown>): Record<string, string> {
  const style: string[] = [];
  if (attrs.align) style.push(`text-align: ${String(attrs.align)}`);
  if (typeof attrs.indent === 'number' && attrs.indent > 0) {
    style.push(`margin-left: ${attrs.indent * 2}em`);
  }
  return style.length ? { style: style.join('; ') } : {};
}

// A look the word processor sets (colour, highlight, size, typeface), drawn
// as a span marked as ours. Pasting reads it only from such a span: text
// copied from another app (Google Docs puts black, Arial and 11pt on every
// run, Word its own fonts) keeps its words and structure and takes this
// page's look, while a copy within the app keeps what the writer set.
function styleMark(cssProperty: string, attr: string) {
  return {
    attrs: { [attr]: {} },
    parseDOM: [
      {
        tag: 'span[data-mwps-style]',
        getAttrs: (dom: HTMLElement) => {
          const value = dom.style.getPropertyValue(cssProperty);
          return value ? { [attr]: value } : false;
        },
      },
    ],
    toDOM: (mark: { attrs: Record<string, unknown> }): DOMOutputSpec => [
      'span',
      { style: `${cssProperty}: ${String(mark.attrs[attr])}`, 'data-mwps-style': '' },
      0,
    ],
  };
}

// A document is its writing, blocks, then one `mwps_data` node holding the
// modules' data (nodes in the `module_data` group), which no editor of the
// writing shows. The host makes it on load and for a new document, so every
// open document has it; only a card's copy of the writing (a `doc` over
// blocks alone) lacks it, which the optional marker allows.
export const baseNodes: Record<string, NodeSpec> = {
  doc: { content: 'block+ mwps_data?' },

  paragraph: {
    group: 'block',
    content: 'inline*',
    attrs: { ...blockAttrs },
    parseDOM: [{ tag: 'p' }],
    toDOM: (node) => ['p', blockDOMAttrs(node.attrs), 0],
  },

  heading: {
    group: 'block',
    content: 'inline*',
    defining: true,
    attrs: { level: { default: 1 }, ...blockAttrs },
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: (node) => [`h${node.attrs.level}`, blockDOMAttrs(node.attrs), 0],
  },

  blockquote: {
    group: 'block',
    content: 'block+',
    defining: true,
    attrs: { ...blockAttrs },
    parseDOM: [{ tag: 'blockquote' }],
    toDOM: (node) => ['blockquote', blockDOMAttrs(node.attrs), 0],
  },

  code_block: {
    group: 'block',
    content: 'text*',
    marks: '',
    code: true,
    defining: true,
    attrs: { lang: { default: null as string | null }, ...blockAttrs },
    parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
    toDOM: (node) => ['pre', blockDOMAttrs(node.attrs), ['code', 0]],
  },

  bullet_list: {
    group: 'block',
    content: 'list_item+',
    attrs: { ...blockAttrs },
    parseDOM: [{ tag: 'ul' }],
    toDOM: (node) => ['ul', blockDOMAttrs(node.attrs), 0],
  },

  ordered_list: {
    group: 'block',
    content: 'list_item+',
    attrs: { start: { default: 1 }, ...blockAttrs },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom: HTMLElement) => ({ start: Number(dom.getAttribute('start') ?? 1) }),
      },
    ],
    toDOM: (node) => {
      const attrs = blockDOMAttrs(node.attrs);
      return node.attrs.start === 1 ? ['ol', attrs, 0] : ['ol', { ...attrs, start: String(node.attrs.start) }, 0];
    },
  },

  list_item: {
    content: 'block+',
    defining: true,
    parseDOM: [{ tag: 'li' }],
    toDOM: () => ['li', 0],
  },

  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM: () => ['hr'],
  },

  image: {
    group: 'inline',
    inline: true,
    draggable: true,
    attrs: {
      src: {},
      alt: { default: null as string | null },
      title: { default: null as string | null },
    },
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (dom: HTMLElement) => ({
          src: dom.getAttribute('src'),
          alt: dom.getAttribute('alt'),
          title: dom.getAttribute('title'),
        }),
      },
    ],
    toDOM: (node) => ['img', { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title }],
  },

  hard_break: {
    group: 'inline',
    inline: true,
    selectable: false,
    leafText: () => '\n',
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },

  text: { group: 'inline' },
};

export const baseMarks: Record<string, MarkSpec> = {
  strong: {
    // Google Docs wraps what it copies in <b style="font-weight:normal">, and
    // marks bold and plain runs by weight (ProseMirror's basic schema's rules).
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (dom: HTMLElement) => dom.style.fontWeight !== 'normal' && null },
      { style: 'font-weight=400', clearMark: (m) => m.type.name === 'strong' },
      { style: 'font-weight', getAttrs: (value: string) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null },
    ],
    toDOM: () => ['strong', 0],
  },
  em: {
    parseDOM: [
      { tag: 'em' },
      { tag: 'i' },
      { style: 'font-style=italic' },
      { style: 'font-style=normal', clearMark: (m) => m.type.name === 'em' },
    ],
    toDOM: () => ['em', 0],
  },
  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM: () => ['code', 0],
  },
  link: {
    attrs: { href: {}, title: { default: null as string | null } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom: HTMLElement) => ({ href: dom.getAttribute('href'), title: dom.getAttribute('title') }),
      },
    ],
    toDOM: (mark) => ['a', { href: mark.attrs.href, title: mark.attrs.title }, 0],
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM: () => ['u', 0],
  },
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
    toDOM: () => ['s', 0],
  },
  textColor: styleMark('color', 'color'),
  backgroundColor: styleMark('background-color', 'color'),
  fontSize: styleMark('font-size', 'size'),
  fontFamily: styleMark('font-family', 'family'),
};
