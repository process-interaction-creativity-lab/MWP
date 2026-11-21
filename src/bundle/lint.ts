// Warnings about a module's source file that the typechecker can't give:
// mistakes modules have made that still build. Used by `npm run check` and
// by the module creator's check. Pure, so it runs in Node and in the page.

// Tailwind isn't available to modules: its utilities exist only for the
// kit, behind a `tw:` prefix. A utility-looking class is likely a mistake.
const UTILITY =
  /^(?:-?[mp][trblxyse]?-\d|gap-|space-[xy]-|[wh]-|(?:min|max)-[wh]-|text-(?:xs|sm|base|lg|\d?xl|left|right|center)$|font-(?:thin|light|normal|medium|semibold|bold)$|bg-|rounded|border-|flex$|flex-|grid$|grid-cols-|items-|justify-|inline-flex$|shadow|opacity-|z-\d|tw:)/;

/** Warnings for one source file (`file` names it in each), one per line. */
export function lintSource(file: string, text: string): string[] {
  const warnings: string[] = [];
  const lineOf = (index: number) => text.slice(0, index).split('\n').length;
  for (const m of text.matchAll(/className=(?:"([^"]*)"|\{\s*['"`]([^'"`]*)['"`]\s*\})/g)) {
    const found = (m[1] ?? m[2] ?? '').split(/\s+/).filter((c) => UTILITY.test(c));
    if (found.length) {
      warnings.push(
        `${file}:${lineOf(m.index)}: warning: ${found.join(' ')} look like Tailwind classes, which modules don't have; use the module's own CSS (export const styles)`,
      );
    }
  }
  // A plugin's `view.dom` is the pane's element, which holds a layout's
  // chrome and not the cards in a side view: events and containment go
  // through ProseMirror's props, which reach every card. A module's own
  // small editor is not a pane, so its `dom` is all of it: skip what's
  // inside a `new EditorView(…)` call (its props' handlers). Not names
  // assigned from it: a module's own editor and a pane plugin's both tend
  // to be called `view`.
  const own = ownEditorCalls(text);
  for (const m of text.matchAll(/\.dom\.(addEventListener|contains)\(/g)) {
    if (own.some(([a, b]) => m.index > a && m.index < b)) continue;
    const instead = m[1] === 'contains' ? 'posAtDOM (it throws for a node in no card)' : "a plugin's props.handleDOMEvents";
    warnings.push(`${file}:${lineOf(m.index)}: warning: view.dom.${m[1]} sees only the pane's element, not every card the writer edits in; use ${instead}`);
  }
  return warnings;
}

/** The source spans of a file's `new EditorView(…)` calls. */
function ownEditorCalls(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const m of text.matchAll(/new EditorView\(/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
    }
    spans.push([m.index, i]);
  }
  return spans;
}
