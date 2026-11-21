import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ActionDeclaration, ModuleContext } from 'mwps';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Toggle } from 'mwps/ui';
import { textOf, writing } from 'mwps/text';
import bundled from './words.json';

export const actions = {
  toggle: { title: 'Toggle unfamiliar-word marking' },
  dictionary: { title: 'Edit the familiar-words list' },
} satisfies Record<string, ActionDeclaration>;

/** The writer's list; null until edited, meaning the bundled one. */
const wordsKey = valueKey<string[] | null>('words', { default: null, persist: true });
const onKey = valueKey('on', { default: true, persist: true });
const openKey = valueKey('open', { default: false });
const draftKey = valueKey('draft', { default: '' });

const DEFAULT_WORDS: string[] = [...new Set((bundled as string[]).map((w) => w.toLowerCase()))];

/** Lowercase, split on commas and newlines, drop blanks and duplicates. */
const parseList = (raw: string): string[] => [
  ...new Set(raw.split(/[,\r\n]+/).map((w) => w.trim().toLowerCase()).filter(Boolean)),
];

const normal = (w: string) => w.toLowerCase().replace(/[’‘]/g, "'");

interface Range {
  from: number;
  to: number;
}

// Unfamiliar words of a block, as offsets from the block's start, cached per
// block node and per list.
const cache = new WeakMap<Set<string>, WeakMap<Node, Range[]>>();

function unfamiliarIn(block: Node, familiar: Set<string>): Range[] {
  let perList = cache.get(familiar);
  if (!perList) cache.set(familiar, (perList = new WeakMap()));
  const hit = perList.get(block);
  if (hit) return hit;
  const t = textOf(block, 0);
  const out: Range[] = [];
  for (const m of t.text.matchAll(/\S+/gu)) {
    const raw = m[0];
    const lead = raw.match(/^[^\p{L}\p{N}]*/u)![0].length;
    const trail = raw.match(/[^\p{L}\p{N}]*$/u)![0].length;
    const word = raw.slice(lead, raw.length - trail);
    if (!word) continue;
    const unknown = word
      .split(/[-‐‑–—]+/u)
      .some((part) => /\p{L}/u.test(part) && !familiar.has(normal(part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))));
    if (!unknown) continue;
    const from = m.index + lead;
    const to = m.index + raw.length - trail;
    out.push({ from: t.pos(from), to: t.pos(to, -1) });
  }
  perList.set(block, out);
  return out;
}

export function setup(ctx: ModuleContext) {
  const words = ctx.getValue(wordsKey);
  const sets = new WeakMap<string[], Set<string>>();
  const familiarSet = (): Set<string> => {
    const list = words.get() ?? DEFAULT_WORDS;
    let s = sets.get(list);
    if (!s) sets.set(list, (s = new Set(list)));
    return s;
  };

  ctx.each(ctx.panes, (p) => {
    const on = p.getValue(onKey);
    const open = p.getValue(openKey);
    const draft = p.getValue(draftKey);

    p.provide(
      new Plugin({
        props: {
          decorations: (state) => {
            if (!on.get()) return null;
            const familiar = familiarSet();
            const decos: Decoration[] = [];
            writing(state.doc).descendants((node, pos) => {
              if (!node.isTextblock) return true;
              if (node.type.spec.code) return false;
              for (const r of unfamiliarIn(node, familiar)) {
                if (r.to <= r.from) continue;
                decos.push(
                  Decoration.inline(pos + r.from, pos + r.to, {
                    class: 'unfamiliar-words-mark',
                    title: 'Not in the familiar-words list',
                  }),
                );
              }
              return false;
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    );

    p.provide(actions.toggle, { procedure: () => (on.set((v) => !v), true), active: () => on.get() });
    p.provide(actions.dictionary, {
      procedure: () => {
        draft.set((words.get() ?? DEFAULT_WORDS).join('\n'));
        open.set(true);
        return true;
      },
    });

    const Controls = () => {
      const toggle = useAction(p, actions.toggle);
      const dict = useAction(p, actions.dictionary);
      return (
        <>
          <Toggle size="sm" pressed={toggle.active} onPressedChange={toggle.run}>
            Unfamiliar words
          </Toggle>
          <Button size="sm" variant="outline" onClick={dict.run}>
            Dictionary
          </Button>
        </>
      );
    };
    p.provide(ui.toolbar(Controls));

    const close = () => open.set(false);
    const Box = () => {
      const isOpen = useStore(open);
      const text = useStore(draft);
      return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
          <DialogContent
            className="unfamiliar-words-dialog"
          >
            <DialogTitle>Familiar words</DialogTitle>
            <DialogDescription>
              Words not in this list are marked in the text. One word per line; commas also separate. Saving
              replaces the list for every document and pane.
            </DialogDescription>
            <textarea
              className="unfamiliar-words-text"
              aria-label="Familiar words"
              value={text}
              onChange={(e) => draft.set(e.target.value)}
            />
            <div className="unfamiliar-words-buttons">
              <Button size="sm" variant="outline" onClick={() => draft.set(DEFAULT_WORDS.join('\n'))}>
                Reset to default
              </Button>
              <Button size="sm" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  words.set(parseList(draft.get()));
                  close();
                }}
              >
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      );
    };
    p.provide(ui.modal(Box));
  });
}

export const styles = `
.unfamiliar-words-mark {
  background: color-mix(in srgb, #f59e0b 24%, transparent);
  border-bottom: 1px dotted #d97706;
}
.unfamiliar-words-text {
  width: 100%;
  height: 16rem;
  resize: vertical;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  padding: 0.25rem 0.5rem;
}
.unfamiliar-words-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
`;
