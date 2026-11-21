// word-processor: the everyday formatting kit as a toolbar, actions and keys.
// Everything it edits is stored in the document (base marks, `indent`, list and
// heading nodes), so turning the module off leaves the formatting in place.
import type { ActionDeclaration, ModuleContext, PaneScope } from 'mwps';
import { ui, useAction, useStore } from 'mwps';
import { Toggle } from 'mwps/ui';
import type { MarkType, NodeType } from 'prosemirror-model';
import { toggleMark } from 'prosemirror-commands';
import { liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list';
import type { Command, EditorState } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';
import type { Step } from 'prosemirror-transform';
import { useEffect, useRef } from 'react';

export const actions = {
  bold: { title: 'Bold', keys: 'Mod-b' },
  italic: { title: 'Italic', keys: 'Mod-i' },
  underline: { title: 'Underline', keys: 'Mod-u' },
  bulletList: { title: 'Bullet list', keys: 'Mod-Shift-8' },
  orderedList: { title: 'Numbered list', keys: 'Mod-Shift-9' },
  heading1: { title: 'Heading 1', keys: 'Mod-Alt-1' },
  heading2: { title: 'Heading 2', keys: 'Mod-Alt-2' },
  heading3: { title: 'Heading 3', keys: 'Mod-Alt-3' },
  paragraph: { title: 'Plain paragraph', keys: 'Mod-Alt-0' },
  indent: { title: 'Indent (nest list item)', keys: 'Tab' },
  outdent: { title: 'Outdent (lift list item)', keys: 'Shift-Tab' },
} satisfies Record<string, ActionDeclaration>;

const MAX_INDENT = 10;
const SIZES = [12, 14, 16, 17, 18, 20, 24, 28, 32];
const DEFAULT_SIZE = 17;
const DEFAULT_COLOR = '#1a1a1a';
const FAMILIES: Record<string, string> = {
  default: '',
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  mono: 'ui-monospace, Menlo, Consolas, monospace',
};

// ---- reading the state (types always come from the state's own schema) ----

const markType = (s: EditorState, name: string): MarkType | undefined => s.schema.marks[name];
const nodeType = (s: EditorState, name: string): NodeType | undefined => s.schema.nodes[name];

// NodeType.attrs is public at runtime but missing from ProseMirror's typings.
const attrNames = (t: NodeType): string[] => Object.keys((t as unknown as { attrs: object }).attrs);

function markAttrs(s: EditorState, name: string): Record<string, any> | null {
  const type = markType(s, name);
  if (!type) return null;
  const { $from, empty, from, to } = s.selection;
  if (empty) return (type.isInSet(s.storedMarks || $from.marks()))?.attrs ?? null;
  let found: Record<string, any> | null = null;
  s.doc.nodesBetween(from, to, (n) => {
    if (found || !n.isInline) return;
    found = type.isInSet(n.marks)?.attrs ?? null;
  });
  return found;
}

/** Is the whole selection (or the caret's next text) in the mark? */
function markActive(name: string) {
  return (s: EditorState) => {
    const type = markType(s, name);
    if (!type) return false;
    const { $from, from, to, empty } = s.selection;
    if (empty) return !!type.isInSet(s.storedMarks || $from.marks());
    return s.doc.rangeHasMark(from, to, type);
  };
}

function listAncestor(s: EditorState, type?: NodeType) {
  const { $from } = s.selection;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    const t = n.type.name;
    if ((t === 'bullet_list' || t === 'ordered_list') && (!type || n.type === type)) {
      return { node: n, pos: $from.before(d) };
    }
  }
  return null;
}

function headingLevel(s: EditorState): number {
  const { $from } = s.selection;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.name === 'heading') return n.attrs.level;
  }
  return 0;
}

function toHex(v: unknown): string {
  if (typeof v !== 'string') return DEFAULT_COLOR;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(s);
  if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map((x) => Math.min(255, +x).toString(16).padStart(2, '0')).join('');
  return DEFAULT_COLOR;
}

function familyKey(v: unknown): string {
  if (typeof v !== 'string') return 'default';
  const norm = (x: string) => x.replace(/["'\s]/g, '').toLowerCase();
  for (const [k, stack] of Object.entries(FAMILIES)) if (stack && norm(stack) === norm(v)) return k;
  return 'default';
}

// ---- commands ----

const markToggle = (name: string): Command => (state, dispatch) => {
  const type = markType(state, name);
  return type ? toggleMark(type)(state, dispatch) : false;
};

/** Set a mark with attrs on the selection (or the next typed text); `null` clears it. */
const setMark = (name: string, attrs: Record<string, any> | null): Command => (state, dispatch) => {
  const type = markType(state, name);
  if (!type) return false;
  if (dispatch) {
    const tr = state.tr;
    if (state.selection.empty) {
      if (attrs) tr.addStoredMark(type.create(attrs));
      else tr.removeStoredMark(type);
    } else {
      for (const { $from, $to } of state.selection.ranges) {
        if (attrs) tr.addMark($from.pos, $to.pos, type.create(attrs));
        else tr.removeMark($from.pos, $to.pos, type);
      }
    }
    dispatch(tr);
  }
  return true;
};

/** Make the selected textblocks `name`, carrying over attributes both types have. */
const setBlock = (name: string, attrs: Record<string, any> = {}): Command => (state, dispatch) => {
  const type = nodeType(state, name);
  if (!type) return false;
  const tr = state.tr;
  let can = false;
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
    if (!node.isTextblock) return true;
    if (!parent || !parent.canReplaceWith(index, index + 1, type)) return false;
    can = true;
    const next: Record<string, any> = {};
    for (const k of attrNames(type)) if (k in node.attrs) next[k] = node.attrs[k];
    Object.assign(next, attrs);
    if (node.type !== type || Object.keys(next).some((k) => next[k] !== node.attrs[k])) {
      tr.setNodeMarkup(pos, type, next);
    }
    return false;
  });
  if (!can) return false;
  if (dispatch && tr.docChanged) dispatch(tr.scrollIntoView());
  return true;
};

const toggleList = (name: 'bullet_list' | 'ordered_list'): Command => (state, dispatch) => {
  const type = nodeType(state, name);
  const item = nodeType(state, 'list_item');
  if (!type || !item) return false;
  const inThis = listAncestor(state, type);
  if (inThis) {
    // Lift out of every enclosing list of this type, as one transaction.
    if (!dispatch) return liftListItem(item)(state);
    const steps: Step[] = [];
    let cur = state;
    for (let i = 0; i < 20 && listAncestor(cur, type); i++) {
      let captured;
      if (!liftListItem(item)(cur, (t) => (captured = t))) break;
      const t = captured!;
      steps.push(...t.steps);
      cur = cur.apply(t);
    }
    if (!steps.length) return false;
    const tr = state.tr;
    for (const st of steps) tr.step(st);
    tr.setSelection(TextSelection.create(tr.doc, cur.selection.anchor, cur.selection.head));
    dispatch(tr.scrollIntoView());
    return true;
  }
  const other = listAncestor(state);
  if (other) {
    if (dispatch) {
      const next: Record<string, any> = {};
      for (const k of attrNames(type)) if (k in other.node.attrs && k !== 'start') next[k] = other.node.attrs[k];
      dispatch(state.tr.setNodeMarkup(other.pos, type, next));
    }
    return true;
  }
  return wrapInList(type)(state, dispatch);
};

/** Change the nearest indentable block's step by `delta`; declines at the limits. */
const shiftIndent = (delta: 1 | -1): Command => (state, dispatch) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.name === 'list_item' || !(attrNames(n.type).includes('indent'))) continue;
    const next = Math.max(0, Math.min(MAX_INDENT, (n.attrs.indent ?? 0) + delta));
    if (next === (n.attrs.indent ?? 0)) return false;
    dispatch?.(state.tr.setNodeMarkup($from.before(d), undefined, { ...n.attrs, indent: next }));
    return true;
  }
  return false;
};

/** In a list, the item is nested or lifted, or nothing happens (the first
 *  item can't nest); elsewhere the block's indent steps. */
const inList = (state: EditorState): boolean => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'list_item') return true;
  return false;
};
const tab: Command = (state, dispatch) => {
  const item = nodeType(state, 'list_item');
  return item && inList(state) ? sinkListItem(item)(state, dispatch) : shiftIndent(1)(state, dispatch);
};
const shiftTab: Command = (state, dispatch) => {
  const item = nodeType(state, 'list_item');
  return item && inList(state) ? liftListItem(item)(state, dispatch) : shiftIndent(-1)(state, dispatch);
};

const heading = (level: number) => setBlock('heading', { level });

export const styles = /* css */ `
  .word-processor-bar { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .word-processor-bar select {
    height: 28px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--background); color: var(--foreground); font: inherit; font-size: 13px; padding: 0 4px;
  }
  .word-processor-bar select:disabled, .word-processor-bar input:disabled { opacity: 0.5; }
  .word-processor-bar input[type='color'] {
    width: 28px; height: 28px; padding: 1px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--background); cursor: pointer;
  }
  .word-processor-bar button { min-width: 28px; }
`;

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.provide(actions.bold, { command: markToggle('strong'), active: markActive('strong') });
    p.provide(actions.italic, { command: markToggle('em'), active: markActive('em') });
    p.provide(actions.underline, { command: markToggle('underline'), active: markActive('underline') });
    p.provide(actions.bulletList, {
      command: toggleList('bullet_list'),
      active: (s) => !!listAncestor(s, nodeType(s, 'bullet_list')),
    });
    p.provide(actions.orderedList, {
      command: toggleList('ordered_list'),
      active: (s) => !!listAncestor(s, nodeType(s, 'ordered_list')),
    });
    p.provide(actions.heading1, { command: heading(1), active: (s) => headingLevel(s) === 1 });
    p.provide(actions.heading2, { command: heading(2), active: (s) => headingLevel(s) === 2 });
    p.provide(actions.heading3, { command: heading(3), active: (s) => headingLevel(s) === 3 });
    p.provide(actions.paragraph, { command: setBlock('paragraph'), active: (s) => headingLevel(s) === 0 });
    p.provide(actions.indent, { command: tab });
    p.provide(actions.outdent, { command: shiftTab });

    p.provide(ui.toolbar(() => <Toolbar p={p} />));
  });
}

function Toolbar({ p }: { p: PaneScope }) {
  const bold = useAction(p, actions.bold);
  const italic = useAction(p, actions.italic);
  const underline = useAction(p, actions.underline);
  const bullet = useAction(p, actions.bulletList);
  const ordered = useAction(p, actions.orderedList);
  const levels = [
    useAction(p, actions.paragraph),
    useAction(p, actions.heading1),
    useAction(p, actions.heading2),
    useAction(p, actions.heading3),
  ];
  const level = Math.max(0, levels.findIndex((l) => l.active));

  // Size, family and colour are free choices, not actions. Buttons keep
  // focus in the text; the selects and colour input take it, so they hand
  // it back.
  const run = (cmd: Command) => {
    p.run(cmd);
    p.focus();
  };
  const can = (cmd: Command) => useStore(p.state, (s) => !!s && cmd(s));
  const noState = useStore(p.state, (s) => !s);
  const size = useStore(p.state, (s) => {
    const a = s && markAttrs(s, 'fontSize');
    const n = a ? parseFloat(a.size) : NaN;
    return Number.isFinite(n) ? n : DEFAULT_SIZE;
  });
  const family = useStore(p.state, (s) => familyKey(s && markAttrs(s, 'fontFamily')?.family));
  const color = useStore(p.state, (s) => toHex(s && markAttrs(s, 'textColor')?.color));
  const canSize = can(setMark('fontSize', { size: '1px' }));
  const canFamily = can(setMark('fontFamily', null));
  const canColor = can(setMark('textColor', { color: DEFAULT_COLOR }));

  const colorRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (colorRef.current && colorRef.current.value !== color) colorRef.current.value = color;
  }, [color]);
  // Native `change` fires when the picker is released, so a drag is one edit.
  useEffect(() => {
    const el = colorRef.current;
    if (!el) return;
    const onChange = () => run(setMark('textColor', { color: el.value }));
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  });

  const sizes = SIZES.includes(size) ? SIZES : [...SIZES, size].sort((a, b) => a - b);

  return (
    <span className="word-processor-bar">
      <Toggle size="sm" aria-label="Bold" title="Bold" pressed={bold.active} disabled={!bold.enabled}
        onPressedChange={bold.run}><b>B</b></Toggle>
      <Toggle size="sm" aria-label="Italic" title="Italic" pressed={italic.active} disabled={!italic.enabled}
        onPressedChange={italic.run}><i>I</i></Toggle>
      <Toggle size="sm" aria-label="Underline" title="Underline" pressed={underline.active} disabled={!underline.enabled}
        onPressedChange={underline.run}><u>U</u></Toggle>
      <Toggle size="sm" aria-label="Numbered list" title="Numbered list" pressed={ordered.active} disabled={!ordered.enabled}
        onPressedChange={ordered.run}>1.</Toggle>
      <Toggle size="sm" aria-label="Bullet list" title="Bullet list" pressed={bullet.active} disabled={!bullet.enabled}
        onPressedChange={bullet.run}>&bull;</Toggle>
      <select aria-label="Heading level" title="Heading level" value={level} disabled={!levels.some((l) => l.enabled)}
        onChange={(e) => { levels[+e.target.value]!.run(); p.focus(); }}>
        <option value={0}>Paragraph</option>
        <option value={1}>Heading 1</option>
        <option value={2}>Heading 2</option>
        <option value={3}>Heading 3</option>
      </select>
      <select aria-label="Font size" title="Font size" value={size} disabled={noState || !canSize}
        onChange={(e) => run(setMark('fontSize', { size: `${e.target.value}px` }))}>
        {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select aria-label="Font family" title="Font family" value={family} disabled={noState || !canFamily}
        onChange={(e) => {
          const k = e.target.value;
          run(setMark('fontFamily', k === 'default' ? null : { family: FAMILIES[k] }));
        }}>
        <option value="default">Default</option>
        <option value="serif">Serif</option>
        <option value="sans">Sans</option>
        <option value="mono">Mono</option>
      </select>
      <input ref={colorRef} type="color" aria-label="Text colour" title="Text colour" defaultValue={color}
        disabled={noState || !canColor} />
    </span>
  );
}
