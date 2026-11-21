import { ui, useStore } from 'mwps';
import type { ModuleContext } from 'mwps';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'mwps/ui';
import { Plugin } from 'prosemirror-state';
import type { Command, EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';

import { extractStanzas, type Line, type Stanza } from './lines';
import { DEFAULT_METER_ID, METER_PRESETS, STRONG, meterById, scanLine, type LineScan, type MeterSpec, type ScannedSyllable } from './meter';
import { checkStanza, detectScheme, lineEndWord, type RhymeScheme } from './rhyme';

const METER = 'prosody_meter';

// On heading too: a stanza's meter sits on its first block, and restyling that
// block as a heading and back must not drop the poet's choice.
export const attrs = [{ types: ['doc', 'paragraph', 'heading'], name: METER, spec: { default: null } }];

// ---- Analysis, once per document state ------------------------------------

interface AnalysedLine {
  stanza: Stanza;
  line: Line;
  meter: MeterSpec;
  scan: LineScan;
  letter: string | null;
  matches: boolean;
}

interface Analysis {
  decorations: DecorationSet;
  lines: AnalysedLine[];
  scheme: RhymeScheme | null;
  stanzas: Stanza[];
}

const analyses = new WeakMap<PMNode, Analysis>();

const findMeter = (id: unknown): MeterSpec | null => (typeof id === 'string' ? meterById(id) : null);
const docMeter = (doc: PMNode): MeterSpec => findMeter(doc.attrs[METER]) ?? meterById(DEFAULT_METER_ID)!;

function syllableTitle(syl: ScannedSyllable): string {
  const beat = syl.mark === STRONG ? 'Strong beat: read with emphasis.' : 'Weak beat: read lightly.';
  const foot = syl.footStart ? ' Starts a new foot.' : '';
  const bad = syl.violation ? ' This syllable’s natural stress breaks the meter here.' : '';
  return beat + foot + bad;
}

function labelWidget(letter: string | null, matches: boolean) {
  return () => {
    const span = document.createElement('span');
    span.className = 'prosody-letter';
    span.textContent = letter ?? '';
    span.setAttribute('aria-hidden', 'true');
    if (letter) {
      span.title = matches
        ? `Rhyme scheme slot ${letter}`
        : `Rhyme scheme slot ${letter}: breaks the scheme`;
    }
    return span;
  };
}

function analyse(doc: PMNode): Analysis {
  const cached = analyses.get(doc);
  if (cached) return cached;
  const stanzas = extractStanzas(doc);
  const decos: Decoration[] = [];
  const lines: AnalysedLine[] = [];

  const filled = (s: Stanza) => s.lines.filter((l) => l.words.length > 0);
  const first = stanzas[0];
  const scheme = first ? detectScheme(filled(first)) : null;

  for (const stanza of stanzas) {
    const para = doc.nodeAt(stanza.pos);
    const meter = findMeter(para?.attrs[METER]) ?? docMeter(doc);
    const real = filled(stanza);
    const results = !scheme
      ? real.map(() => ({ letter: null as string | null, matches: true }))
      : stanza === first
        ? real.map((_, i) => ({ letter: scheme.letters[i] ?? null, matches: true }))
        : checkStanza(real, scheme);

    const byLetter = new Map<string, { i: number; word: string }[]>();
    real.forEach((line, i) => {
      const letter = results[i]!.letter;
      const word = lineEndWord(line);
      if (letter && word) byLetter.set(letter, [...(byLetter.get(letter) ?? []), { i, word }]);
    });

    for (const p of stanza.paragraphs) {
      decos.push(Decoration.node(p, p + doc.nodeAt(p)!.nodeSize, { class: 'prosody-line' }));
    }

    real.forEach((line, i) => {
      const { letter, matches } = results[i]!;
      const scan = scanLine(line.words, meter);
      lines.push({ stanza, line, meter, scan, letter, matches });
      const at = (o: number, a = 1) => line.t.pos(o, a);

      // A line that can't be scanned shows no marks.
      for (const syl of scan.scannable ? scan.syllables : []) {
        decos.push(
          Decoration.inline(at(syl.from), at(syl.to, -1), {
            class: 'prosody-syl' + (syl.footStart ? ' prosody-foot' : '') + (syl.violation ? ' prosody-bad' : ''),
            'data-mark': syl.mark === STRONG ? '´' : '˘',
            title: syllableTitle(syl),
          }),
        );
      }

      decos.push(Decoration.widget(at(line.from), labelWidget(letter, matches), { side: -1, key: `prosody-l${at(line.from)}-${letter}-${matches}`, ignoreSelection: true }));

      const last = line.words[line.words.length - 1]!;
      const endWord = lineEndWord(line);
      if (letter && endWord) {
        const partners = (byLetter.get(letter) ?? []).filter((e) => e.i !== i).map((e) => e.word);
        const title = matches
          ? `Rhyme scheme ${letter}. Rhymes with: ${partners.join(', ') || 'no other line'}`
          : `Rhyme scheme ${letter}. Should rhyme with: ${partners.join(', ')}, but doesn’t.`;
        decos.push(
          Decoration.inline(at(last.from), at(last.to, -1), {
            class: 'prosody-end' + (matches ? '' : ' prosody-end-miss'),
            title,
          }),
        );
      }
      if (!matches) {
        decos.push(Decoration.inline(at(line.from), at(line.to, -1), { class: 'prosody-miss' }));
      }
    });
  }

  const result = { decorations: DecorationSet.create(doc, decos), lines, scheme, stanzas };
  analyses.set(doc, result);
  return result;
}

const plugin = new Plugin({
  props: { decorations: (state) => analyse(state.doc).decorations },
});

// ---- Choosing a meter ----------------------------------------------------------

const setDocMeter =
  (id: string): Command =>
  (state, dispatch) => {
    if (dispatch) dispatch(state.tr.setDocAttribute(METER, id));
    return true;
  };

const setStanzaMeter =
  (pos: number, id: string | null): Command =>
  (state, dispatch) => {
    if (state.doc.nodeAt(pos)?.type.name !== 'paragraph') return false;
    if (dispatch) dispatch(state.tr.setNodeAttribute(pos, METER, id));
    return true;
  };

const DEFAULT = 'default';

function MeterOptions() {
  return (
    <SelectContent>
      {METER_PRESETS.map((m) => (
        <SelectItem key={m.id} value={m.id}>
          {m.label}
        </SelectItem>
      ))}
    </SelectContent>
  );
}

// ---- Setup -----------------------------------------------------------------------

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.provide(plugin);

    const Picker = () => {
      const meterId = useStore(p.state, (s) => (s ? docMeter(s.doc).id : null));
      return (
        <Select
          value={meterId ?? DEFAULT_METER_ID}
          disabled={!meterId}
          onValueChange={(id) => {
            p.run(setDocMeter(id));
            p.focus();
          }}
        >
          <SelectTrigger size="sm" title="Meter for this poem" aria-label="Poem meter">
            <SelectValue />
          </SelectTrigger>
          <MeterOptions />
        </Select>
      );
    };
    p.provide(ui.toolbar(Picker));

    const Report = () => {
      const state = useStore(p.state) as EditorState | undefined;
      if (!state) return <p className="prosody-note">No document in this pane.</p>;
      const a = analyse(state.doc);
      const pos = state.selection.from;
      const hit = a.lines.find((l) => {
        const from = l.line.t.pos(l.line.from);
        const to = l.line.t.pos(l.line.to, -1);
        return pos >= from && pos <= to && state.selection.to <= to;
      });
      // A caret inside a verse paragraph's blank line has no line of verse.
      const stanza = hit?.stanza;
      const schemeNote = !a.scheme && (
        <p className="prosody-note">No rhyme scheme detected: the first stanza has no two lines that rhyme perfectly.</p>
      );
      if (!hit || !stanza) {
        return (
          <div className="prosody-report">
            <p>Place the caret in a line of verse to see how it scans.</p>
            {schemeNote}
          </div>
        );
      }
      const override = findMeter(state.doc.nodeAt(stanza.pos)?.attrs[METER]);
      const { scan, meter } = hit;
      const used = scan.tricks.filter((t) => t.applied);
      return (
        <div className="prosody-report">
          <label className="prosody-row">
            <span>This stanza</span>
            <Select
              value={override?.id ?? DEFAULT}
              onValueChange={(v) => {
                p.run(setStanzaMeter(stanza.pos, v === DEFAULT ? null : v));
                p.focus();
              }}
            >
              <SelectTrigger size="sm" aria-label="Stanza meter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT}>Use document default ({docMeter(state.doc).label})</SelectItem>
                {METER_PRESETS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {schemeNote}
          {!scan.scannable ? (
            <p className="prosody-summary">Cannot scan this line as {meter.label}: its syllables don’t fit, even with the liberties.</p>
          ) : (
            <>
              <p className="prosody-summary">
                {scan.violationCount === 0
                  ? `Fits ${meter.label}.`
                  : `${scan.violationCount} spot${scan.violationCount === 1 ? '' : 's'} break${scan.violationCount === 1 ? 's' : ''} the meter.`}
              </p>
              <p className="prosody-note">
                {used.length === 0
                  ? 'No liberties used.'
                  : 'Liberties used: ' + used.map((t) => (t.detail ? `${t.label} (${t.detail})` : t.label)).join('; ') + '.'}
              </p>
            </>
          )}
        </div>
      );
    };
    p.provide(ui.side(Report, { title: 'Prosody' }));
  });
}

export const styles = `
  .prosody-line {
    padding-bottom: 1.5em;
    line-height: 2.2;
  }
  .prosody-syl { position: relative; cursor: help; }
  .prosody-syl::after {
    content: attr(data-mark);
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    font-weight: 700;
    line-height: 1;
    pointer-events: none;
  }
  .prosody-bad::after { color: var(--destructive); }
  .prosody-foot::before {
    content: '';
    position: absolute;
    top: 100%;
    left: -3px;
    margin-top: 1.5em;
    height: 0.6em;
    border-left: 1px solid var(--border);
    pointer-events: none;
  }
  .prosody-letter {
    margin-right: 0.4em;
    font-weight: 700;
    color: var(--primary);
    cursor: help;
  }
  .prosody-letter:empty { display: none; }
  .prosody-end {
    text-decoration: underline dotted;
    text-underline-offset: 3px;
    cursor: help;
  }
  .prosody-end-miss { text-decoration-color: var(--destructive); }
  .prosody-miss { color: var(--destructive); }
  :scope { --mwps-margin-left: 120px; }
  .prosody-letter {
    display: inline-block;
    position: relative;
    left: -3em;
    width: 0;
    margin-right: 0;
    overflow: visible;
  }
  .prosody-report { display: flex; flex-direction: column; gap: 8px; padding: 12px; font-size: 13px; }
  .prosody-row { display: flex; flex-direction: column; gap: 4px; }
  .prosody-summary { font-weight: 600; margin: 0; }
  .prosody-note { color: var(--muted-foreground); margin: 0; }
`;
