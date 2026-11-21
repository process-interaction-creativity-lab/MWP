import { Fragment, Mark, type MarkSpec, type Node } from 'prosemirror-model';
import { Plugin, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';
import { historyKind, ui, useAction, useStore } from 'mwps';
import type { ModuleContext } from 'mwps';
import { valueKey } from 'mwps';
import { reactWidget } from 'mwps/react';
import { idMarks, textOf, splitSentences } from 'mwps/text';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  CommitField,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'mwps/ui';
import { Layers, X } from 'mwps/icons';
import { useState } from 'react';

// A stash is a mark on its live text. The mark carries the alternatives
// (each one a piece of inline content, as JSON), so they travel with the
// text through copy, undo, deletes and splits, and the file.
const MARK = 'revision_stash_live';
const OWN = 'revision-stash';

export const marks: { [name: string]: MarkSpec } = {
  [MARK]: {
    attrs: { id: {}, alts: { default: '[]' }, clean: { default: true } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'span[data-revision-stash]',
        getAttrs: (dom) => ({
          id: (dom as HTMLElement).getAttribute('data-revision-stash'),
          alts: (dom as HTMLElement).getAttribute('data-alts') ?? '[]',
          clean: (dom as HTMLElement).getAttribute('data-clean') !== 'false',
        }),
      },
    ],
    toDOM: (mark) => [
      'span',
      {
        class: 'revision-stash-live',
        'data-revision-stash': mark.attrs.id,
        'data-alts': mark.attrs.alts,
        'data-clean': String(mark.attrs.clean),
      },
      0,
    ],
  },
};

export const actions = {
  stash: { title: 'Stash alternatives', keys: 'Mod-Alt-s' },
};

const openKey = valueKey<string | null>('open', { default: null });
const pickerKey = valueKey<string[] | null>('picker', { default: null });

// ---- Reading stashes -------------------------------------------------------

interface Stash {
  id: string;
  /** Pieces of the live text, as ranges in the document. */
  runs: readonly { from: number; to: number }[];
  from: number;
  to: number;
  altsJson: unknown[];
  alts: Fragment[];
  clean: boolean;
  liveText: string;
}

const fragText = (f: Fragment) => f.textBetween(0, f.size, ' ', ' ');

const stashMarks = idMarks(MARK);
const cache = new WeakMap<Node, readonly Stash[]>();

function stashesOf(doc: Node): readonly Stash[] {
  const hit = cache.get(doc);
  if (hit) return hit;
  const list = stashMarks.spans(doc).map((sp): Stash => {
    let altsJson: unknown[] = [];
    try {
      const parsed = JSON.parse(sp.mark.attrs.alts);
      if (Array.isArray(parsed)) altsJson = parsed;
    } catch {
      // a damaged value reads as no alternatives
    }
    return {
      ...sp,
      altsJson,
      alts: altsJson.map((j) => Fragment.fromJSON(doc.type.schema, j)),
      clean: sp.mark.attrs.clean !== false,
      liveText: '',
    };
  });
  for (const s of list) s.liveText = fragText(liveContent(doc, s));
  cache.set(doc, list);
  return list;
}

const stashNamed = (doc: Node, id: string) => stashesOf(doc).find((s) => s.id === id);

const stripMark = (f: Fragment): Fragment => {
  const out: Node[] = [];
  f.forEach((n) => out.push(n.mark(n.marks.filter((m) => m.type.name !== MARK))));
  return Fragment.fromArray(out);
};

const withMark = (f: Fragment, mark: Mark): Fragment => {
  const out: Node[] = [];
  f.forEach((n) => out.push(n.isText || n.isLeaf ? n.mark(mark.addToSet(n.marks)) : n));
  return Fragment.fromArray(out);
};

/** The live text as inline content without the stash mark; pieces in
 *  different blocks are joined by a space. */
function liveContent(doc: Node, s: Stash): Fragment {
  let out = Fragment.empty;
  s.runs.forEach((r, i) => {
    if (i > 0) out = out.append(Fragment.from(doc.type.schema.text(' ')));
    out = out.append(doc.slice(r.from, r.to).content);
  });
  return stripMark(out);
}

const squash = (s: string) => s.replace(/\s+/g, '');

// ---- Edits -------------------------------------------------------------


const retag = (tr: Transaction, s: Stash, altsJson: unknown[], clean: boolean) =>
  stashMarks.set(tr, s.id, { alts: JSON.stringify(altsJson), clean });

const own = (tr: Transaction) => tr.setMeta(OWN, true);

interface Sentence {
  from: number;
  to: number;
  text: string;
  content: Fragment;
}

/** The sentences the selection touches, snapped outward to whole sentences;
 *  null unless there are two or more and none is already in a stash. */
function sentencesIn(state: EditorState): Sentence[] | null {
  const { from, to, empty } = state.selection;
  if (empty) return null;
  const out: Sentence[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    const t = textOf(node, pos);
    for (const s of splitSentences(t.text)) {
      const lead = s.text.length - s.text.trimStart().length;
      const trail = s.text.length - s.text.trimEnd().length;
      const a = s.from + lead;
      const b = s.to - trail;
      if (b <= a) continue;
      const sf = t.pos(a);
      const st = t.pos(b, -1);
      if (st > from && sf < to) out.push({ from: sf, to: st, text: s.text.trim(), content: state.doc.slice(sf, st).content });
    }
    return false;
  });
  if (out.length < 2) return null;
  const markType = state.schema.marks[MARK];
  if (state.doc.rangeHasMark(out[0].from, out[out.length - 1].to, markType)) return null;
  return out;
}

const stashChoice = (index: number, texts: string[]): Command => (state, dispatch) => {
  const sents = sentencesIn(state);
  if (!sents || sents.length !== texts.length || sents.some((s, i) => s.text !== texts[i]) || !sents[index]) return false;
  if (dispatch) {
    const t = state.schema.marks[MARK];
    const others = sents.filter((_, i) => i !== index).map((s) => s.content.toJSON());
    const mark = t.create({ id: crypto.randomUUID(), alts: JSON.stringify(others), clean: true });
    const tr = state.tr.replaceWith(sents[0].from, sents[sents.length - 1].to, withMark(sents[index].content, mark));
    dispatch(own(tr));
  }
  return true;
};

const editStash =
  (id: string, change: (s: Stash, doc: Node) => unknown[] | null): Command =>
  (state, dispatch) => {
    const s = stashNamed(state.doc, id);
    if (!s) return false;
    const alts = change(s, state.doc);
    if (!alts) return false;
    if (dispatch) {
      const tr = state.tr;
      retag(tr, s, alts, s.clean);
      dispatch(own(tr));
    }
    return true;
  };

const asJSON = (state: EditorState, text: string) => Fragment.from(state.schema.text(text)).toJSON();

const addAlternative =
  (id: string, text: string): Command =>
  (state, dispatch) => {
    if (!text.trim()) return false;
    return editStash(id, (s) => [...s.altsJson, asJSON(state, text)])(state, dispatch);
  };

const editAlternative =
  (id: string, index: number, text: string): Command =>
  (state, dispatch) => {
    if (!text.trim()) return false;
    return editStash(id, (s) => (index < s.altsJson.length ? s.altsJson.map((a, i) => (i === index ? asJSON(state, text) : a)) : null))(state, dispatch);
  };

const deleteAlternative = (id: string, index: number): Command =>
  editStash(id, (s) => (index < s.altsJson.length ? s.altsJson.filter((_, i) => i !== index) : null));

const switchTo =
  (id: string, index: number): Command =>
  (state, dispatch) => {
    const s = stashNamed(state.doc, id);
    const alt = s?.alts[index];
    if (!s || !alt || alt.size === 0) return false;
    if (dispatch) {
      const old = liveContent(state.doc, s).toJSON();
      const tr = state.tr;
      const mark = state.schema.marks[MARK].create({
        id,
        alts: JSON.stringify(s.altsJson.map((a, i) => (i === index ? old : a))),
        clean: true,
      });
      tr.replaceWith(s.from, s.to, withMark(stripMark(alt), mark));
      dispatch(own(tr));
    }
    return true;
  };

const resolve =
  (id: string): Command =>
  (state, dispatch) => {
    const s = stashNamed(state.doc, id);
    if (!s) return false;
    if (dispatch) {
      const tr = state.tr;
      stashMarks.remove(tr, id);
      dispatch(own(tr));
    }
    return true;
  };

const select =
  (id: string): Command =>
  (state, dispatch) => {
    const s = stashNamed(state.doc, id);
    if (!s) return false;
    dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, s.from, s.to)).scrollIntoView());
    return true;
  };

// ---- The plugin: badges, saving the old wording, pasting -------------------

const decoCache = new WeakMap<Node, Map<string, DecorationSet>>();

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const open = p.getValue(openKey);
    const picker = p.getValue(pickerKey);

    const Badge = ({ id }: { id: string }) => {
      const n = useStore(p.state, (s) => (s ? stashNamed(s.doc, id)?.alts.length ?? 0 : 0));
      return (
        <button
          type="button"
          className="revision-stash-badge"
          title="Alternatives: switch, edit, add, delete or resolve"
          aria-label={`Stash: ${n} alternatives`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => open.set(id)}
        >
          +{n}
        </button>
      );
    };

    p.provide(
      new Plugin({
        // Editing the live text in place saves its previous wording once:
        // a consequence of the writer's edit, so it joins that undo step.
        appendTransaction(trs, oldState, newState) {
          if (!trs.some((t) => t.docChanged)) return null;
          if (trs.some((t) => historyKind(t) || t.getMeta(OWN))) return null;
          const before = stashesOf(oldState.doc);
          let tr: Transaction | null = null;
          for (const s of stashesOf(newState.doc)) {
            if (!s.clean) continue;
            const o = before.find((b) => b.id === s.id);
            if (!o) continue;
            const was = liveContent(oldState.doc, o);
            if (squash(fragText(was)) === squash(s.liveText)) continue;
            tr ??= newState.tr;
            retag(tr, s, [...s.altsJson, was.toJSON()], false);
          }
          return tr;
        },
        props: {
          decorations: (state) => {
            let byDoc = decoCache.get(state.doc);
            if (!byDoc) decoCache.set(state.doc, (byDoc = new Map()));
            let set = byDoc.get(p.id);
            if (!set) {
              set = DecorationSet.create(
                state.doc,
                stashesOf(state.doc).map((s) =>
                  reactWidget(s.to, () => <Badge id={s.id} />, { key: `revision-stash-${s.id}`, side: 1 }),
                ),
              );
              byDoc.set(p.id, set);
            }
            return set;
          },
          transformPasted: stashMarks.transformPasted,
        },
      }),
    );

    // Stashing: the control asks which sentence stays live.
    p.provide(actions.stash, {
      command: (state, dispatch) => {
        const sents = sentencesIn(state);
        if (!sents) return false;
        if (dispatch) picker.set(sents.map((s) => s.text));
        return true;
      },
    });

    const Control = () => {
      const stash = useAction(p, actions.stash);
      if (!stash.enabled) return null;
      return (
        <Button size="sm" variant="ghost" onClick={stash.run}>
          <Layers size={16} /> Stash alternatives
        </Button>
      );
    };
    p.provide(ui.selection(Control));

    const Picker = () => {
      const choices = useStore(picker);
      return (
        <Dialog open={choices !== null} onOpenChange={(o) => !o && picker.set(null)}>
          <DialogContent
            className="revision-stash-picker"
          >
            <DialogHeader>
              <DialogTitle>Which sentence stays?</DialogTitle>
              <DialogDescription>The others are kept as alternatives behind the live text.</DialogDescription>
            </DialogHeader>
            <div className="revision-stash-choices">
              {(choices ?? []).map((text, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="revision-stash-choice"
                  onClick={() => {
                    p.run(stashChoice(i, choices!));
                    picker.set(null);
                  }}
                >
                  {text}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      );
    };
    p.provide(ui.modal(Picker));

    // The panel for the stash whose badge was clicked.
    const Panel = () => {
      const id = useStore(open);
      const st = useStore(p.state, (s) => (s && id ? stashNamed(s.doc, id) ?? null : null));
      const [draft, setDraft] = useState('');
      if (!st) return null;
      // A button took the focus: give the caret back to the text.
      const act = (c: Command) => {
        p.run(c);
        p.focus();
      };
      const add = () => {
        if (p.run(addAlternative(st.id, draft))) setDraft('');
      };
      return (
        <div className="revision-stash-panel" role="region" aria-label="Stash alternatives">
          <div className="revision-stash-head">
            <strong>Alternatives</strong>
            <Button size="icon" variant="ghost" aria-label="Close panel" onClick={() => open.set(null)}>
              <X size={16} />
            </Button>
          </div>
          <div className="revision-stash-label">Live</div>
          <div className="revision-stash-livetext">{st.liveText}</div>
          {st.alts.map((alt, i) => {
            const text = fragText(alt);
            return (
              <div className="revision-stash-alt" key={`${i}:${text}`}>
                <CommitField multiline aria-label={`Alternative ${i + 1}`} value={text} rows={2} onCommit={(t) => p.run(editAlternative(st.id, i, t))} />
                <div className="revision-stash-row">
                  <Button size="sm" variant="outline" onClick={() => act(switchTo(st.id, i))}>
                    Make live
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => act(deleteAlternative(st.id, i))}>
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="revision-stash-row">
            <Input
              aria-label="New alternative"
              placeholder="New alternative"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <Button size="sm" variant="outline" onClick={add}>
              Add
            </Button>
          </div>
          <Button size="sm" variant="secondary" onClick={() => act(resolve(st.id))}>
            Resolve
          </Button>
        </div>
      );
    };
    p.provide(ui.overlay(Panel));

    // The survey: every stash in the document.
    const Survey = () => {
      const [shown, setShown] = useState(false);
      const list = useStore(
        p.state,
        (s) => (s ? stashesOf(s.doc).map((x) => `${x.id}\u0000${x.alts.length}\u0000${x.liveText}`).join('\u0001') : ''),
      );
      const items = list ? list.split('\u0001').map((r) => r.split('\u0000')) : [];
      return (
        <Popover open={shown} onOpenChange={setShown}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost">
              Needs work ({items.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent className="revision-stash-survey">
            {items.length === 0 && <div className="revision-stash-label">No stashes</div>}
            {items.map(([id, n, text]) => (
              <Button
                key={id}
                variant="ghost"
                className="revision-stash-item"
                onClick={() => {
                  p.run(select(id));
                  open.set(id);
                  setShown(false);
                  p.focus();
                }}
              >
                <span className="revision-stash-item-text">{text}</span>
                <span className="revision-stash-item-count">+{n}</span>
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      );
    };
    p.provide(ui.toolbar(Survey));
  });
}

export const styles = `
.revision-stash-live {
  background: color-mix(in srgb, #facc15 22%, transparent);
}
.revision-stash-badge {
  display: inline-block;
  margin-left: 2px;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--muted);
  color: var(--muted-foreground);
  font: inherit;
  font-size: 0.7em;
  line-height: 1.4;
  vertical-align: super;
  cursor: pointer;
  user-select: none;
}
/* While the panel is open the page grows a right margin for it to sit in. */
:scope:has(.revision-stash-panel) {
  --mwps-margin-right: calc(324px - var(--mwps-page-gutter));
}
.revision-stash-panel {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
  box-sizing: border-box;
  width: 300px;
  max-height: calc(100% - 16px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
}
.revision-stash-head,
.revision-stash-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.revision-stash-head { justify-content: space-between; }
.revision-stash-label,
.revision-stash-item-count { color: var(--muted-foreground); font-size: 12px; }
.revision-stash-livetext { background: color-mix(in srgb, #facc15 22%, transparent); padding: 2px 4px; }
.revision-stash-alt { display: flex; flex-direction: column; gap: 4px; }
.revision-stash-choices { display: flex; flex-direction: column; gap: 6px; }
.revision-stash-choice { height: auto; white-space: normal; text-align: left; justify-content: flex-start; }
.revision-stash-survey { display: flex; flex-direction: column; gap: 2px; max-height: 60vh; overflow: auto; }
.revision-stash-item { display: flex; justify-content: space-between; gap: 8px; height: auto; white-space: normal; text-align: left; }
.revision-stash-item-text { flex: 1; }
`;
