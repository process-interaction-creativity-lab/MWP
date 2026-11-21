import type { Command, EditorState, Selection, Transaction } from 'prosemirror-state';
import { writing } from 'mwps/text';
import { Plugin, PluginKey } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import type { ChildHandle, ModuleContext } from 'mwps';
import { authorOf, documentPlugin, historyKind, originOf, ui, useAction, useStore, valueKey } from 'mwps';
import { reader, type CommitLog } from 'mwps/changes';
import { Button, ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'mwps/ui';

const openKey = valueKey<boolean>('open', { default: true, persist: true });

export const actions = {
  giblets: { title: 'Show giblets' },
};

// ---- The word rules ------------------------------------------------------

type Dir = 'back' | 'forward';

/** A half-built letter-by-letter run. */
interface Run {
  dir: Dir;
  /** `from` of the last deleted character. */
  pos: number;
  /** Non-space characters deleted so far, in reading order. */
  acc: string;
  /** The run's far edge was a boundary when it started, so `acc` is a whole word. */
  anchored: boolean;
}

const isBoundary = (ch: string | null) => ch === null || /^\s$/.test(ch);
const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Text removed and inserted by a transaction, summed over its steps. */
function measure(tr: Transaction) {
  let removed = 0;
  let inserted = 0;
  const pieces: string[] = [];
  let replaceOnly = true;
  tr.steps.forEach((step, i) => {
    if (!(step instanceof ReplaceStep)) {
      replaceOnly = false;
      return;
    }
    const { from, to, slice } = step as ReplaceStep & { from: number; to: number };
    const doc = tr.docs[i];
    removed += doc.textBetween(from, to, '').length;
    pieces.push(doc.textBetween(from, to, ' '));
    inserted += slice.content.textBetween(0, slice.content.size, '').length;
  });
  return { removed, inserted, text: pieces.join(' '), replaceOnly };
}

/** One of the writer's own transactions, classified: the run it leaves and
 *  the line it buries, if any. Pure. */
function classify(run: Run | null, tr: Transaction, before: Selection): { run: Run | null; line: string | null } {
  const m = measure(tr);
  // 1. Two or more characters removed: one chunk.
  if (m.removed >= 2) return { run: null, line: normalise(m.text) || null };
  // 2. One character removed, nothing inserted: letter by letter.
  const step = tr.steps[0] as (ReplaceStep & { from: number; to: number }) | undefined;
  if (
    m.removed === 1 && m.inserted === 0 && m.replaceOnly && tr.steps.length === 1 &&
    step && step.to - step.from === 1 && before.empty && tr.before.nodeAt(step.from)?.isText
  ) {
    const dir: Dir | null = before.head === step.to ? 'back' : before.head === step.from ? 'forward' : null;
    if (dir) return letter(run, tr, step.from, dir);
  }
  // 3. Anything else that changed the text: typing, Enter, joins, a one-
  //    character replacement. Discards the half-built word.
  return { run: null, line: null };
}

function letter(run: Run | null, tr: Transaction, from: number, dir: Dir): { run: Run; line: string | null } {
  const $f = tr.before.resolve(from);
  const parent = $f.parent;
  const off = $f.parentOffset;
  const ch = parent.textBetween(off, off + 1, '', '\ufffc');
  const left = off > 0 ? parent.textBetween(off - 1, off, '', '\ufffc') : null;
  const right = off + 1 < parent.content.size ? parent.textBetween(off + 1, off + 2, '', '\ufffc') : null;
  const far = dir === 'back' ? right : left;
  const near = dir === 'back' ? left : right;

  const continues = run && run.dir === dir && from === (dir === 'back' ? run.pos - 1 : run.pos);
  const r: Run = continues && run ? { ...run, pos: from } : { dir, pos: from, acc: '', anchored: isBoundary(far) };
  let line: string | null = null;

  if (/^\s$/.test(ch)) {
    if (r.anchored && r.acc) line = r.acc;
    r.acc = '';
    r.anchored = isBoundary(far);
  } else {
    r.acc = dir === 'back' ? ch + r.acc : r.acc + ch;
    if (isBoundary(near)) {
      if (r.anchored && r.acc) line = r.acc;
      r.acc = '';
    }
  }
  return { run: r, line };
}

// ---- Capture, on the main child ----------------------------------------

interface Capture {
  run: Run | null;
  /** The lines to bury, read once each by the pane's flush. */
  log: CommitLog<string>;
}
const captureKey = new PluginKey<Capture>('giblets-file-capture');

// Only the writer's own edits in this pane count: not ones received from
// other panes or modules, not undo or redo, and not follow-ups (a
// follow-up to an undo is the writer's by `authorOf`). Selection moves
// neither bury nor break a run; anyone else's edit breaks it.
const capture = new Plugin<Capture>({
  key: captureKey,
  state: {
    init: () => ({ run: null, log: { seq: 0, entries: [] } }),
    apply(tr, s, old) {
      if (!tr.docChanged) return s;
      const writersHere =
        originOf(tr) === 'local' && !tr.getMeta('appendedTransaction') && historyKind(tr) === null && authorOf(tr) === 'user';
      if (!writersHere) return s.run ? { ...s, run: null } : s;
      const { run, line } = classify(s.run, tr, old.selection);
      if (!line) return { ...s, run };
      const seq = s.log.seq + 1;
      return { run, log: { seq, entries: [...s.log.entries.slice(-255), { seq, entry: line }] } };
    },
  },
});

/** Appends one paragraph per line at the end of the document, the first
 *  filling an empty last paragraph (a new document's) rather than leaving
 *  it blank above the entries. */
function appendLines(lines: readonly string[]): Command {
  return (state, dispatch) => {
    const para = state.schema.nodes.paragraph;
    if (!para || !lines.length) return false;
    if (dispatch) {
      const nodes = lines.map((l) => para.create(null, state.schema.text(l)));
      const last = writing(state.doc).lastChild;
      const end = writing(state.doc).content.size;
      const tr =
        last && last.type === para && last.content.size === 0
          ? state.tr.replaceWith(end - last.nodeSize, end, nodes)
          : state.tr.insert(end, nodes);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// ---- The layout ----------------------------------------------------------

export const moduleType = 'editorReplacement';

export function setup(ctx: ModuleContext) {
  // Burying edits another document after the writer's change, which only
  // a document plugin's update may do; burials are per pane, so each
  // document keeps the flushes of the giblets panes on it.
  const flushes = new Map<string, Set<() => void>>();
  ctx.each(ctx.documents, (d) =>
    d.provide(documentPlugin({ view: () => ({ update: () => flushes.get(d.id)?.forEach((flush) => flush()) }) })),
  );

  ctx.each(ctx.panes, (p) => {
    const docId = p.documentId;
    if (docId === null) return;
    const open = p.getValue(openKey);
    // The main editor shows this pane's document; the grave is the
    // writer's, picked with the document picker, and survives a switch here.
    const children = p.hostChildPanes({ persist: true });
    const has = (owner: ChildHandle['owner']) => children.list.get().some((h) => h.owner === owner);
    if (!has('module')) children.create({ owner: 'module' });
    if (!has('writer')) children.create({ owner: 'writer', document: null });

    let read: ((now: EditorState) => string[]) | null = null;
    let main: ChildHandle | null = null;
    // The grave while it shows a document other than this one.
    let grave: ChildHandle | null = null;
    p.each(children, (c, handle) => {
      if (handle.owner === 'module') {
        c.provide(capture);
        c.effect(() => {
          main = handle;
          read = reader((s) => captureKey.getState(s)!.log, c.state.get()!);
          return () => {
            main = null;
            read = null;
          };
        });
      } else if (c.documentId === docId) {
        const Note = () => (
          <p className="giblets-file-note" role="alert">
            This is the document you're editing; pick a different one to bury words in.
          </p>
        );
        c.provide(ui.overlay(Note));
      } else if (c.documentId !== null) {
        c.effect(() => {
          grave = handle;
          return () => void (grave = null);
        });
      }
    });

    const flush = () => {
      const state = main?.state.get();
      if (!state || !read) return;
      const lines = read(state);
      if (lines.length && grave) grave.run(appendLines(lines));
    };
    p.effect(() => {
      const set = flushes.get(docId) ?? new Set();
      flushes.set(docId, set.add(flush));
      return () => void set.delete(flush);
    });

    // Placing giblets moves focus into the main editor.
    p.effect(() => {
      if (p.isLastFocused.get()) main?.focus();
    });

    p.provide(actions.giblets, {
      procedure: () => (open.set((o) => !o), true),
      active: () => open.get(),
    });
    p.provide(ui.tabMenu(actions.giblets));

    const Layout = () => {
      const isOpen = useStore(open);
      const list = useStore(children.list);
      const toggle = useAction(p, actions.giblets);
      const mainChild = list.find((h) => h.owner === 'module');
      const graveChild = list.find((h) => h.owner === 'writer');

      return (
        <div className="giblets-file-root">
          <div className="giblets-file-body">
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel id="main" minSize="20%" defaultSize="60%">
                <div className="giblets-file-cell">{mainChild?.element}</div>
              </ResizablePanel>
              {isOpen && <ResizableHandle key="handle" withHandle />}
              {isOpen && (
                <ResizablePanel key="grave" id="grave" minSize="15%" defaultSize="40%">
                  <div className="giblets-file-cell giblets-file-column">
                    <div className="giblets-file-header">
                      <span className="giblets-file-title">Giblets</span>
                      <button
                        type="button"
                        className="giblets-file-close"
                        title="Close giblets"
                        aria-label="Close giblets"
                        onClick={toggle.run}
                      >
                        ×
                      </button>
                    </div>
                    <div className="giblets-file-child">{graveChild?.element}</div>
                  </div>
                </ResizablePanel>
              )}
            </ResizablePanelGroup>
          </div>
          {!isOpen && (
            <div className="giblets-file-strip">
              <Button variant="ghost" size="sm" title="Show giblets" aria-label="Show giblets" onClick={toggle.run}>
                ⚰
              </Button>
            </div>
          )}
        </div>
      );
    };
    p.provide(ui.editorReplacement(Layout));
  });
}

export const styles = `
.giblets-file-root {
  display: flex;
  height: 100%;
  min-height: 0;
}
.giblets-file-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.giblets-file-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.giblets-file-column {
  background: var(--muted);
  font-size: 0.92em;
}
.giblets-file-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-bottom: 1px solid var(--border);
}
.giblets-file-title {
  flex: 1;
  font-weight: 500;
}
.giblets-file-note {
  position: absolute;
  inset: 8px 10px auto;
  margin: 0;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--background);
  color: var(--destructive, var(--foreground));
}
.giblets-file-close {
  flex: none;
  width: 22px;
  height: 22px;
  line-height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  opacity: 0.7;
}
.giblets-file-close:hover {
  opacity: 1;
  background: var(--background);
}
.giblets-file-child {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0 4px;
}
.giblets-file-strip {
  flex: none;
  display: flex;
  align-items: flex-start;
  padding: 2px;
  border-left: 1px solid var(--border);
  background: var(--background);
}
`;
