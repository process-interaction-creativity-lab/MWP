import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ModuleContext } from 'mwps';
import { Button, Popover, PopoverContent, PopoverTrigger } from 'mwps/ui';
import { textOf, writing } from 'mwps/text';

type Category = 'personal' | 'social' | 'discourse' | 'temporal' | 'spatial';

const words = (s: string) => s.split(/\s+/).filter(Boolean);

// Listed in precedence order: a word in several lists takes the first.
const LISTS: Record<Category, string[]> = {
  personal: words(`i me my mine myself we us our ours ourselves you your yours yourself yourselves
    he him his himself she her hers herself it its itself they them their theirs themselves one oneself`),
  social: words(`sir madam ma'am mister missus miss ms mrs mr lord lady majesty highness grace
    doctor dr professor prof reverend father honorable honourable`),
  discourse: words(`thus therefore however moreover furthermore nevertheless nonetheless anyway anyhow
    meanwhile incidentally accordingly consequently otherwise indeed namely specifically finally lastly
    firstly secondly thirdly hereby herein hereinafter hereof hereto thereof thereto therein`),
  temporal: words(`now then today tomorrow yesterday tonight soon later earlier presently currently
    before after already still yet recently lately hence ago`),
  spatial: words(`here there up down left right above below over under near far nearby inside outside
    forward backward forwards backwards ahead behind beside besides beyond across around along`),
};

const LABELS: Record<Category, string> = {
  personal: 'Personal (I, you, we, ...)',
  spatial: 'Spatial (here, there, up, ...)',
  temporal: 'Temporal (now, then, today, ...)',
  discourse: 'Discourse (thus, however, ...)',
  social: 'Social (sir, madam, doctor, ...)',
};

const ORDER: Category[] = ['personal', 'spatial', 'temporal', 'discourse', 'social'];

const CATEGORY = new Map<string, Category>();
for (const c of Object.keys(LISTS) as Category[]) for (const w of LISTS[c]) if (!CATEGORY.has(w)) CATEGORY.set(w, c);

// "it's", "I'm", "they'd": the word before the apostrophe decides.
const CLITIC = /^(.+?)'(s|m|re|d|ve|ll)$/;

function classify(raw: string): Category | undefined {
  const w = raw.toLowerCase().replace(/’/g, "'");
  const whole = CATEGORY.get(w);
  if (whole) return whole;
  const m = CLITIC.exec(w);
  return m ? CATEGORY.get(m[1]) : undefined;
}

const WORD = /\p{L}+(?:['’]\p{L}+)*/gu;

const cache = new WeakMap<Node, DecorationSet>();

function build(doc: Node): DecorationSet {
  const hit = cache.get(doc);
  if (hit) return hit;
  const decos: Decoration[] = [];
  writing(doc).descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    const t = textOf(node, pos);
    for (const m of t.text.matchAll(WORD)) {
      const c = classify(m[0]);
      if (!c) continue;
      const from = t.pos(m.index);
      const to = t.pos(m.index + m[0].length, -1);
      if (to > from) decos.push(Decoration.inline(from, to, { class: `deictic-highlighter-${c}` }));
    }
    return false;
  });
  const set = DecorationSet.create(doc, decos);
  cache.set(doc, set);
  return set;
}

const legendOpen = valueKey('legend-open', { default: false });

export const actions = { legend: { title: 'Show deictic word legend' } };

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.provide(new Plugin({ props: { decorations: (state) => build(state.doc) } }));

    const open = p.getValue(legendOpen);
    p.provide(actions.legend, { procedure: () => (open.set((v) => !v), true), active: () => open.get() });

    const Legend = () => {
      const legend = useAction(p, actions.legend);
      const isOpen = useStore(open);
      return (
        <Popover open={isOpen} onOpenChange={open.set}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" disabled={!legend.enabled}>
              Deictic legend
            </Button>
          </PopoverTrigger>
          <PopoverContent className="deictic-highlighter-legend">
            {ORDER.map((c) => (
              <div key={c} className="deictic-highlighter-row">
                <span className={`deictic-highlighter-swatch deictic-highlighter-${c}`}>word</span>
                {LABELS[c]}
              </div>
            ))}
          </PopoverContent>
        </Popover>
      );
    };
    p.provide(ui.toolbar(Legend));
  });
}

export const styles = `
.deictic-highlighter-personal { background-color: hsla(50, 95%, 55%, 0.4); }
.deictic-highlighter-spatial { background-color: hsla(130, 60%, 45%, 0.4); }
.deictic-highlighter-temporal { background-color: hsla(210, 85%, 55%, 0.4); }
.deictic-highlighter-discourse { background-color: hsla(280, 65%, 60%, 0.4); }
.deictic-highlighter-social { background-color: hsla(0, 80%, 58%, 0.4); }
.deictic-highlighter-legend { display: flex; flex-direction: column; gap: 6px; width: auto; }
.deictic-highlighter-row { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.deictic-highlighter-swatch { padding: 0 6px; border-radius: 2px; }
`;
