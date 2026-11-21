# Writing an mwps module

*The contract is [`src/api/mwps.d.ts`](/src/api/mwps.d.ts): read it first. Its comments are the rules. This guide covers what a type file can't say: which tool to reach for, and the patterns that keep coming up. The examples come from the ported modules in [`modules/`](/modules/). ProseMirror and browser facts that modules have tripped on are one line each in [`tips.md`](tips.md): grep it before working one out by trial.*

## What a module is

A module is a folder `modules/<id>/` with:

- `index.tsx`: exports `setup(ctx)` and, optionally, `moduleType`, `nodes`, `marks`, `attrs`, `actions` and `styles` (see `ModuleExports` in the contract).
- `description.md`: what the module does for the writer, the spec you build from (see "The description" below).
- `qa.md`: a five-minute checklist for trying it by hand.

`npm run new -- <id>` starts the folder and keeps an existing `description.md` and `qa.md`. `npm run check -- <id>` typechecks the module against the contract, bundles it the way the host does and installs it, so a module the app would refuse to load fails here; run it until it says `ok`. `npm run dev` serves the app. The writer places a module from a pane's tab menu (the tab above the pane): tick it under the search box. A project module is placed from the project tab.

A module may import only:

| Import | What |
|---|---|
| `mwps` | the contract: `ui`, `useStore`, `useAction`, `valueKey`, `documentPlugin`, `nonEmpty`, `authorOf`, `originOf`, `historyKind`, and the types |
| `mwps/ui` | the UI kit: shadcn components (`Button`, `Toggle`, `ToggleGroup`, `Popover`, `Dialog`, `Resizable…`, …), listed in [`src/ui/index.ts`](/src/ui/index.ts) |
| `mwps/icons` | every [lucide](https://lucide.dev/icons) icon as a React component (`<Columns2 size={16} />`) |
| `mwps/text` | `textOf`, `writing`, `ordinaryBlocks`, `isOrdinary`, `sentencesOf`, `sections`, `splitSentences`, `splitWords`, `findData`, `dataChildren`, `appendData`, `dataEnd` ([`text.ts`](/src/lib/text.ts)); `heldSpans` ([`held.ts`](/src/lib/held.ts)); `idMarks` ([`idmarks.ts`](/src/lib/idmarks.ts)) |
| `mwps/changes` | `commitLog`, `reader`: facts from `apply` to a plugin view ([`changes.ts`](/src/lib/changes.ts)) |
| `mwps/ai` | `chat`, `stream`, `json`, `shape`, `toolLoop`, `transcribe`, `generateImage`, `supports`, `failure`: talk to the writer's models through `ctx.ai` ([`ai.ts`](/src/lib/ai.ts)) |
| `mwps/react` | `reactWidget`: a widget decoration with a React body ([`react.d.ts`](/src/api/react.d.ts)) |
| `react`, `react-dom` | the page's one React |
| `prosemirror-*` | `state`, `view`, `model`, `transform`, `commands`, `history`, `keymap`, `schema-list`, `dropcursor`, `gapcursor`, and `utils` ([prosemirror-utils](https://github.com/atlassian/prosemirror-utils)) |
| `./anything` | the module's own files. JSON is bundled into the module (`import words from './words.json'`). A data file (`.txt`, `.tsv`, `.csv`, `.bin`, `.gz`, `.wasm`, images, `.mp3`, `.glb`) imports as its URL, to `fetch` when first needed (`import url from './lexicon.tsv'`): large data stays out of the module's load |

Anything else needs a small `package.json` in the module folder (`"private": true`, `"type": "module"` and its `dependencies`) and its own `npm install` there. The dependency is bundled into the module; its `node_modules` isn't committed.

## The description

`description.md` says what the module does for the writer, never how it is built. It comes first: when someone asks for "a module that does X", turn the request into a description, settle it with them (by asking, or by prototyping and revising the description as you learn), then build against it. Keep it current as the module changes, so it always says what the module does.

- **It opens with a summary**, right under the title `# <id>: description`: one plain paragraph for a writer choosing modules, at most 60 words, no code, links or emphasis. The tab menu shows it beside the module's name, and `npm run check` requires it.
- **Then the requirements**, from the writer's side: who it's for, what they see and do, where each thing appears (the toolbar, a side tab, beside the text, over a selection), what each action does, what undo does, what is remembered and for how long, what happens with AI off and in a second pane on the same document. While the module is off its data is kept in the file and shown plainly or not at all, and is back when it returns; that state needs no more design than that. A list is usually clearest; arrange the rest as it reads best.
- **Leave out how:** plugins, decorations or the overlay, helpers, caches, data structures, which API carries an edit. Name a contract term only where the writer meets the thing (an action, a side tab, the tab menu). For each line, ask whether a writer, or someone checking the running module, would notice if it were different; if not, cut it.
- **A requirement you can only state by naming a host mechanism** is a gap in the contract: raise it, rather than writing the mechanism in.
- **Be true to the source** (a paper's system, a request): it comes first. Depart from it only where following it is complicated and would make a poor experience in the app, and then by a small change to the UI, said in the description. Add nothing the source doesn't have, except what mwps needs from every module, on its own and alongside others: where data is kept, what happens to an answer whose text changed meanwhile, a second pane, undo, sharing the text with other modules. List each as added, with the reason.
- **An AI prompt may be given in full:** it shapes what the writer gets. Where the source publishes its prompt, use it word for word and say where it comes from. Long prompts go in a last section, *Prompts*, so the requirements stay short; give them there in full rather than pointing elsewhere, since the module's folder is all a builder reads. Prompts running to hundreds of lines (a system of agents) go in `prompts.md` beside the description instead, which that section names.
- **Don't re-specify what the app already gives.** Stopping an AI call is the stop button in the pane's tab; undo is the pane's history; tabs are the side tab row. Name them only where the writer uses them.
- **A module that needs AI** says so in its summary, and with AI off its controls grey out. That needs no more design.

`qa.md` is 4 to 8 numbered steps someone can work through in the running app in about five minutes, each saying what to do and what to confirm. It checks the description, not pixels, and goes to the risky spots: undo, a second pane, AI off, turning the module off and on.

## ProseMirror plus scopes

Everything that touches the text is plain ProseMirror: plugins, decorations, commands, node views, key handlers and specs. If you know how to do something in ProseMirror, do it that way. The framework adds only these:

- **Scopes** say where something lives and for how long: the module, each pane, each document, and `with` children. Every scope has `effect`, `signal`, `with`, `each` and `getValue`.
- **Values** are small stores on a scope. Declare one at top level with `valueKey`, read it in plugins with `get()` and in React with `useStore`. Setting a value redraws the module's panes, so a decoration that reads it updates by itself.
- **Two doors for edits:** the writer's, on the pane's undo stack, and the module's own, on none (see "Editing" below).
- **Actions and UI roots** let the writer reach the module.

## Actions first

**Expose each feature as an action first, and build its UI second.** A single implementation then reaches the palette (Mod-/), keyboard shortcuts, the tab menu and the module's own buttons. Declare actions as data, implement them in a scope, and draw buttons with `useAction`:

```tsx
const legendKey = valueKey('legend', { default: false, persist: true });
export const actions = { legend: { title: 'Toggle sentence length legend', keys: 'Mod-Alt-l' } };

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const open = p.getValue(legendKey);
    p.provide(actions.legend, { procedure: () => (open.set((v) => !v), true), active: () => open.get() });

    const Control = () => {
      const legend = useAction(p, actions.legend); // { enabled, active, run }
      return <Toggle size="sm" pressed={legend.active} disabled={!legend.enabled} onPressedChange={legend.run}>Legend</Toggle>;
    };
    p.provide(ui.toolbar(Control));
  });
}
```

- **Keys the writer presses on the text are actions,** so they reach the palette and the menus. `keymap` from `prosemirror-keymap` is for a module's own small editor and for a layout's child panes.
- Use `{ command }` for an action that edits or depends on the selection. It greys out when the command can't run, rechecked on every change to the pane's state, so its button and key follow. Return `false` when you would do nothing, so the key passes on (in development the console warns when an action said yes and then did nothing). A command that only starts work (an AI call) behind `if (dispatch)` and returns `true` has run. Use `{ procedure }` for everything else (toggles, dialogs). `active` makes it show as on.
- **To grey a procedure, or act on what your UI points at,** provide it inside `with(value)`: `ctx.with(speaking, (s) => s.provide(actions.stop, …))` greys Stop while nothing plays (Escape that closes your layer is provided only while the layer is open), and `p.with(pointed, (s, item) => s.provide(actions.remove, { procedure: () => remove(item) }))` acts on the item the value names. A procedure is never asked whether it can run, so it should not decline. For the opposite, an action only while something *isn't* going on, its command reads the value: `if (job.get()) return false`. Setting a value redraws the pane, which rechecks every command.
- `useAction(p, …)` finds the action wherever it is provided from the pane outward, the module scope included.
- **A control that acts on something other than the caret** (a button beside the hovered paragraph) runs a command for that place with `p.run(cycle(pos))`; the action, for the palette and its key, runs the same command at the caret. Such a button doesn't take `useAction(...).enabled`, which answers for the caret, not its place. When the action lives inside a `with` (`p.with(ctx.ai, …)`), the button reads the condition with `useStore(ctx.ai)` and runs the same command function, passing it what the `with` gave.
- An action takes no arguments. For a small set of choices, declare one action per choice, generated at the top of the file from a list (`heading1`, `heading2`, …), the way ProseMirror makes one command per setting with `setBlockType(type, attrs)`.
- Some choices are free: a font size from a long list, any colour. These have no action; the control runs a command with `p.run`. word-processor's toolbar shows both kinds: nine `useAction` buttons, plus size, family and colour through `p.run`.
- **Binding a key the writer would name is an action** (Bold, Indent, Continue with AI): its `keys`. Give a key only to what a writer does often enough to learn one; the palette reaches the rest. **Changing how input behaves is a raw handler**, a pane plugin's `handleKeyDown` (a mode's Backspace, arrows that hop hidden text, Enter inside your own block, Escape while your request is out). Raw handlers run before every action key, so a mode or something of yours that is open sits under the bindings.
- **An ambiguous key opens the palette.** A key press asks every action bound to it whether it can run: none, the key passes on; one, it runs; several, the palette opens at the caret with just those, and the writer picks. So two modules may share a key (Tab is Indent, Continue with AI and Allude with AI), and an honest `false` from a command that wouldn't act keeps the palette from offering it. Avoid Mod-Alt with C, I, J or U: Chrome on macOS keeps them. The palette takes focus while the writer picks, so something of yours that a blur dismisses (a suggestion, a hint) must survive focus moving into it (a `relatedTarget` inside `[role="dialog"]`), or the action chosen there finds nothing to act on.

## Which scope

```tsx
export function setup(ctx: ModuleContext) {
  // ctx: the module, while it is placed in at least one pane. Actions and UI, no plugins.
  ctx.each(ctx.panes, (p) => {
    // p: one pane the module is placed on. Plugins that draw or handle input,
    // per-pane actions, toolbar items and the pane's own UI roots.
  });
  ctx.each(ctx.documents, (d) => {
    // d: one document those panes show, once however many panes show it.
    // Document plugins (reactions, whole-document data), timers that edit with d.edit.
  });
  ctx.with(someValue, (s, v) => {
    // s: while someValue is present (not null, undefined or false).
  });
}
```

- **Plugins go on a pane or a document scope, never on the module scope.** A plugin for every pane is `ctx.each(ctx.panes, (p) => p.provide(plugin))`. Create a plugin where its data lives. A plugin that reads `p` is created inside that pane's `each`. A plugin that reads nothing pane-specific is created once at top level and provided on every pane (one instance may serve many panes).
- A `with` scope takes no plugins. A plugin that is only sometimes active reads a value instead: `decorations: (s) => (on.get() ? build(s) : null)`.
- Anything that has to start and stop goes in `s.effect(() => { …; return cleanup; })`, never directly in the setup body. Setup must not edit, and timers and listeners need their cleanup. Async work checks `s.signal.aborted` after each `await`, or passes `s.signal` to `fetch`.
- **One pane at a time, and "this and that":** `p.isLastFocused` is present while `p` is the pane the writer last focused. A `with` inside a `with` lives while both conditions are present:
  ```ts
  p.with(p.isLastFocused, (s) => s.with(on, (s) => s.effect(() => startCycle(p))));
  ```

## Where data goes

Ask two questions.

1. **Would a copy of the file be wrong without it, or does it need undo?** (A paragraph's meter, a note, a cast list, a document setting.) Then it goes in the document, as a node, a mark or an attribute: what is in the document is saved with the file, kept through copy and paste, and undone like text. Your own node and mark types go in `nodes` and `marks`. An attribute on a base type (`paragraph`, `doc`, `strong`, …) goes in `attrs`. Writing it is an edit. List every base type the block can be restyled into, not only the one your module reads (`types: ['paragraph', 'heading']` for an attribute of a text block): changing a block's type keeps the attributes both types have, so one missing on the new type is gone, and isn't back when the block changes back. Your module may ignore the attribute on the other types.
2. **Otherwise it is a value**, on the scope it belongs to. Declare it once with `valueKey(name, { default, persist? })`, then get the instance with `ctx.getValue` (one per module: a setting), `d.getValue` or `p.document.getValue` (per document), or `p.getValue` (per pane: is the legend open in this pane). `persist: true` keeps a value across reloads, as JSON. A persisted document value is where the draft's history and this device's conveniences go: earlier versions of the text, a cache of AI answers you'd rather not pay for again. A copy of the file rightly starts without them, and undo doesn't touch them. It is kept while the module is off, and forgotten when the writer removes what it belongs to: a pane value when they unplace the module from that pane, a document value when they delete the document; a module value is the writer's and stays. A value that isn't persisted may hold anything, such as a function that aborts a call. A component reads any of these with `useStore`, whichever scope it is on. `p.document.getValue` is the document's value, not the pane's: every pane on the document shares it, and it outlives the pane that set it while the document is open anywhere. An answer that arrives after the document closes is dropped, since a set after its scope ends does nothing.

The document holds some kinds of data in particular ways:

- **Notes about the writing are marks** (a highlight, a comment's anchor). **Writing that isn't live** (a tracked deletion, a footnote) is an inline node in the `inline_aside` group, so that other modules' text reading skips it. Writing that must go wherever some live text goes (the alternatives to a phrase, copied, deleted and undone with it) is an attribute of a mark on that text instead; an attribute can hold JSON, such as `Fragment.toJSON()` to keep formatting.
- **Your own marks** go in `marks`, as for `new Schema`:
  ```ts
  export const marks = {
    x_note: { attrs: { id: {}, body: { default: '' } }, inclusive: false, excludes: '',
      parseDOM: [{ tag: 'span[data-x-note]', getAttrs: (d) => ({ id: d.getAttribute('data-x-note'), body: d.getAttribute('data-body') ?? '' }) }],
      toDOM: (m) => ['span', { 'data-x-note': m.attrs.id, 'data-body': m.attrs.body }, 0] },
  };
  ```
  `inclusive: false` keeps typing at either end out of the mark, but the writer can't then select the marked text and retype it in place: the first typed character replaces the range without the mark, and the span is gone. A mark whose text the writer rewrites in place (an alternative) is inclusive, and typing just after it joins it; `excludes: ''` lets marks of the type overlap. A mark that carries an id (a note, a take, a comment) is read and edited with `idMarks` (below). Its `toDOM` is what shows where your module isn't running, without your styles.
- **Your own blocks** go in `nodes`, with `group: 'block'` so a document may hold them, and **every one is `isolating: true`**: the install is refused without it, because the edges of a block that isn't isolating leak into the writing (Backspace at the start of the paragraph after it pulls that paragraph into your block; Delete at the end of the paragraph before it pulls your block's text out). Isolating is the whole rule. Inside the block, any schema you like, and ProseMirror's own Enter, Backspace, Delete and arrows work with no key code of yours; at its edges the first Backspace or Delete selects the block and the second deletes it whole. Backspace at the start of a block of yours that holds nothing turns it into an empty paragraph, so an empty one can always be removed; each of your blocks has an info mark in the left margin that names your module. Enter, Backspace or Delete that nothing takes inside your block (its schema has no room for it: Enter in a one-line block) does nothing, and the mark says so for a moment; you needn't block such keys yourself. Marks, attributes on base types and inline nodes need no such rule (but give an inline node no content). A `parseDOM` rule for a textblock of yours that is drawn as a `p` needs a `priority` above 50, or the base paragraph's rule takes it. Without your module, a block that holds blocks (a region) shows as a plain container: its paragraphs are drawn and edited as writing, and your block's type and attributes are kept, so when your module is back the block is yours again with the text as edited meanwhile. A block that holds text or nothing (a field, a marker) shows as an opaque placeholder. Four shapes, by how they sit in the writing:
  - **A region**: an isolating block of `paragraph+` beside the writing, with any data its paragraphs share in attributes. glas-columns' notes are one, placed after the paragraph they belong to. The writer types in it like the rest of the text (Enter makes another paragraph inside it and never leaves it), and other modules' text work reaches it. While your module is off its paragraphs stay on the page as plain text under a faint edge, and a writer's edits to them are kept.
    ```ts
    export const nodes = {
      x_notes: { group: 'block', content: 'paragraph+', isolating: true,
        toDOM: () => ['div', { class: 'x-notes' }, 0] },
    };
    ```
  - **A block drawn from attributes** (a marker, a picture): a block with no content, sealed by having no text. Give it `leafText` and text readers (counts, search, an AI prompt) read it as that text instead of skipping it; draw it with `toDOM` or a node view.
  - **Fields inside a sealed block**: fixed children (a scene heading as three text fields, each a textblock of yours), edited in place like text. A range selected across two fields and deleted merges them, which is fine.
  - **A section start**: a block of yours (a marker, or a heading with fields) that starts a section of the writing, which runs to the next start. A scene, a beat. The writing between starts is ordinary paragraphs the writer types freely, text flows across a section's end, and the section's planning goes in the start's attributes. Deleting a start merges its section into the one above; a pasted copy of a start is a copy of its section, so starts need no ids. `sections(doc, isStart)` from `mwps/text` reads them: each start with its position, the blocks it owns (`body`) and where its writing ends (`to`); starts of two kinds (a scene and its beats) are one call whose `isStart` accepts both.

  A region or a section? A section divides a stream of writing: every stretch belongs to the start above it, text flows across the cuts, and only starts are marked. A region is a unit the module owns whole, with both ends its own: notes beside a paragraph, with the writer's text resuming after them, or the text of one card on a canvas. A card shows one node, so text a module shows as cards is regions.

  Where data goes, by who reads it: text that belongs to the writing goes in the node (a note, a scene's lines); a module's own planning goes in attributes; data the writer doesn't read in the flow of the text (a cast list, a log) goes in module data, below.
- **Text the writer types into an attribute** (a note's body) is a `CommitField` from `mwps/ui`: it writes once when they leave the field (per keystroke would be one undo step each), and with `returnFocus={() => p.focus()}` (or a card's `handle.focus()`) hands focus back.
- **A mark that carries an id** (a note, a take, a comment): `const notes = idMarks('x_note')` from `mwps/text`. `notes.spans(doc)` lists its items (`{ id, mark, runs, from, to }`), `notes.find(doc, id)` gets one; `notes.set(tr, id, { body })` changes its attributes on every piece and `notes.remove(tr, id)` takes it off. Set `transformPasted: notes.transformPasted` on a pane plugin: a pasted copy of an item still in the document gets its own id, text pasted inside an item joins it.
- **A document is rewritten whole on every save.** Keep pictures and other bulk in it small (shrink a picture before storing it), or put bulk the file can do without in a persisted document value.
- **An attribute undoes as one blob.** Store each item on the block it belongs to (a link on its source block), never every item in one attribute on `doc`, so that edits to different blocks touch different attributes and don't collide.
- **Data about the whole document** that belongs to no block: one setting is an attribute on `doc`. Anything more (a cast list, a story bible, a log of cuts, a list of prompt widgets) is your module's data, below.
- **Your module's data** is a node of yours in the `module_data` group. A document is its writing, blocks from position 0, then one data node the host keeps at the end, which holds the modules' data and which no editor of the writing shows: Cmd-A and Delete in the text never reach it. It is in the document, so it is saved with the file and undone on the pane's one history (a writer can undo a change to it from the text), and it stays, unseen, while your module is off (inside the data node, a node whose module is missing is an opaque placeholder).
  ```ts
  export const nodes = {
    x_cast: { group: 'module_data', content: 'paragraph+', toDOM: () => ['div', 0] },
  };
  ```
  Give it children, one per item, so each edit touches one item and undoes alone. `appendData(tr, 'x_cast', item)` from `mwps/text` adds an item, making the node the first time (with any child its content requires); `dataChildren(state.doc, 'x_cast')` lists the items with their positions, and `findData` gives the node itself (`{ node, pos }` or null). Change an item with `tr.setNodeAttribute` or `tr.delete` at its position. To show it, `p.dataCards('x_cast')` gives a card per node, an editor of the pane drawn where you draw React (a side view), or not at all; see "Cards" below. Data kept as text (paragraphs) is edited there like the writing, and the other modules on the pane work in it too (an AI rewrite, highlights). Data kept in attributes you draw yourself from the node, in React.
- **Over the whole document, read the writing.** At the caret, a module works on whatever is there, another module's data included. A count, an analysis, a search, a list of blocks or "add at the end" works on `writing(doc)` from `mwps/text`: the document without its data node, in the same positions, so `writing(doc).descendants(…)` walks the text and `writing(doc).content.size` is where the writing ends. `tr.insert(state.doc.content.size, block)` would put a block after the data node, where the schema refuses it.
- **Which block is this, after edits?** For anything that lives only while the document is open (a cached summary, which card was being edited), keep the block's position in plugin state and map it through `tr.mapping` in `apply`: the block stays the same one through typing, and a split keeps it on the first half. A position can't be saved, though: saved data that points at a block (a link to another card) needs an id.
- **Ids for blocks** are stamped by the gesture that first needs one, in its own transaction (`tr.setNodeAttribute(pos, 'x_id', crypto.randomUUID())`), never by a follow-up that gives every block an id. A paste or a split copies an id, so resolve copies when drawing, never by an edit: walk the blocks in order, let the first block with an id keep it, and treat a later one with the same id as having none (its saved data is ignored, and the next gesture that needs an id stamps a fresh one).

Three kinds of data don't fit either answer:

- **Anything tied to document positions** (a held range, the word being spoken) is plugin state, mapped through `tr.mapping` in `apply` and set with a meta transaction. A value doesn't move when the text does. Spans you hold (a range a call will replace, targets the writer picked) are `heldSpans` from `mwps/text` (see "Async and AI edits" below).
- **Data derived from the text** (sentence statistics, a word count) is computed from the state you already have. That can be a pane plugin's state, or a selector over `p.state` in React, cached by `state.doc` in a `WeakMap` (see sentence-length's `analyze`). Each pane computes its own copy, which is fine for anything cheap. For anything costly, use a document plugin, computed once per document. Pane plugins read it with `key.getState(p.document.state.get())`.
- **Data accumulated over time** (a log of deletions, an undo count) can't be recomputed from the text. It is a document plugin's state, which starts when the document opens and so covers the whole time it is open. A total that has to outlive a session goes in a persisted value, which the plugin's view adds to.

## Editing: two doors

Each door follows **whose data the edit writes**, not who clicked.

| Whose | Door | Undo |
|---|---|---|
| **The writer's**: their text and formatting, typing, a button, an action, dictation, AI-written text inserted at their request (even after an `await`) | `p.run(command)`, an action's `{ command }`, a handle's `run`, or the pane's own `view.dispatch` in a plugin handler. All of these are one door. | on the pane's undo stack, like typing |
| **The module's own**: its annotations about the text (highlights, comments, feedback), even when the writer asked for them; a timer, an animation, long unattended work | `d.edit(command)`, `p.document.edit(command)` from pane code, a document plugin view's `dispatch`, or `project.edit` for documents no pane of yours shows | on no stack. Panes receive it like a collaborator's edit. |

So an AI comment the writer asked for is the module's (it writes a note about their text, and their Cmd-Z shouldn't take it back), while an AI rewrite they asked for is theirs. When in doubt, a click is the writer's edit and long unattended work is the module's.

A third kind of edit isn't a door: **a consequence of an edit** (a fix-up, removing an orphan note) is a plugin's `appendTransaction` and joins that edit's undo step. A follow-up sees only edits made in its own state, so it checks the state ("is there an orphan note?") rather than the event, and returns `null` when there's nothing to do. A follow-up that always edits loops and fails your module.

- A command is `(state, dispatch?) => boolean`. Called without `dispatch`, it only reports whether it could run.
- After an `await`, find your target again in the current state, because the writer may have typed in the meantime.
- **Never edit** during setup, inside a dispatch (`apply`, filters, follow-ups), or from a pane plugin view's `update`. Edits that follow a change belong in a document plugin's view (see "Reacting to changes" below).
- **Plugin state changes by a meta transaction**, `view.dispatch(view.state.tr.setMeta(key, change))`, from a pane plugin's DOM handler, a timer or a command: a hover target, a fade. It has no steps, so it isn't an edit and is on no undo stack. With no view at hand (after an `await`, in an effect's cleanup), `p.run((s, dispatch) => (dispatch?.(s.tr.setMeta(key, change)), true))`. To act a while after a change (fade a sentence a second after the caret leaves it), start a timer in the plugin view's `update` and dispatch the meta transaction from the timer.
- **Changing an edit before it happens** (typing that mustn't take a mark's colour, a deletion that keeps some of its range) is a pane plugin's `handleTextInput`, `handleKeyDown`, `handlePaste` or a `cut` DOM event, which make their own transaction: a transaction can't be rewritten once dispatched. To tidy after it instead, `appendTransaction` gets every transaction in the batch (`trs`); what one inserted is `tr.mapping`'s step maps, mapped on through the later steps.
- **Setting a value** is fine anywhere but inside a dispatch: in a command behind `if (dispatch)`, a timer, an effect's cleanup. Once its scope has ended, a set does nothing.
- An edit made through `p.run`, an action's `{ command }` or a handle's `run` is its own undo step: it never joins the writer's typing, and typing after it starts a new step. Give a transaction `tr.setMeta('addToHistory', false)` to keep it off the undo stack, or `tr.setMeta('composition', id)` to let several edits share one step (below).
- Three functions tell edits apart. `authorOf(tr)` returns your module's id for its `d.edit`s (and their follow-ups) and `'user'` for everything else. `originOf(tr)` returns `'local'` for an edit made in this pane and `'received'` for one from elsewhere: the writer typing in a second pane is `'user'` and `'received'`. `historyKind(tr)` returns `'undo'`, `'redo'` or `null`. Another module's follow-up to the writer's edit counts as the writer's, since it is part of their edit.

## Reacting to changes

A reaction has two halves. Facts about an edit exist only in `apply`, where the transactions are, but acting (an edit, a timer, a value) is allowed only in a plugin view's `update`. `mwps/changes` carries the facts across:

```ts
import { commitLog, reader, type CommitLog } from 'mwps/changes';

const deletions = new PluginKey<CommitLog<string[]>>('printer-deletions');
const deletedWords = (tr: Transaction) =>
  tr.docChanged && authorOf(tr) === 'user' && !historyKind(tr) ? wordsRemovedBy(tr) : null;

ctx.each(ctx.documents, (d) =>
  d.provide(documentPlugin({
    key: deletions,
    state: commitLog(deletedWords),
    view: (v) => {
      const read = reader((s) => deletions.getState(s)!, v.state);
      return { update: (v) => tally(read(v.state).flat()) };
    },
  })),
);
```

- **A document plugin** runs once per document however many panes show it, and its view may edit (as the module). It is the right place for counting, logging, AI calls triggered by edits, and anything else done "once per change". Its `update` may see several changes at once: count with `reader`, and never diff `prevState`.
- **A pane plugin** sees every transaction to its pane's state, including those received from other panes and modules. Use one for what is per pane (where the caret is, what to draw), and react in its view's `update` without editing: set a value, restart a timer. To react only to what the writer just did *here*, filter `apply` with `originOf(tr) === 'local'`, skip `historyKind(tr)` and other modules' follow-ups (`tr.getMeta('appendedTransaction')`).
- Don't use an `appendTransaction` that returns `null` as a watcher.
- **Keeping something true after every edit, wherever it came from** (a section that stays last): a pane's follow-up sees only that pane's own edits, so check the state in a document plugin's view `update` and fix it with its `dispatch`.

## Async and AI edits

AI settings are `ctx.ai`. Work inside `ctx.with(ctx.ai, (s, ai) => …)`, which restarts when a setting changes and ends when AI is turned off, so actions provided inside it grey out. Talk to the model with `mwps/ai`, passing `s.signal`:

```ts
import { chat, stream } from 'mwps/ai';
const reply = await chat(ai, { messages: [{ role: 'user', content: prompt }], temperature: 0.2 }, s.signal);
for await (const piece of stream(ai, { messages }, s.signal)) append(piece);
```

- `json(ai, { messages }, reply, signal?)` returns the reply as data of a shape built with `shape`: `const reply = shape.object({ items: shape.array(shape.object({ quote: shape.string(), score: shape.number() })) })`, plus `shape.integer()`, `shape.boolean()` and `shape.enum(values, fallback?)`. The shape is the JSON Schema sent to the endpoint (strict `json_schema`; every property required) and the reader of the reply: a property that is missing or the wrong type reads as `''` (strings are trimmed), `0`, `false`, `[]` or the enum's first value (or `fallback`), so the result always has the shape's type and the module only checks what it means (a non-empty `quote`, an index in range). An endpoint that refuses `json_schema` (400 or 422) is asked again with the schema in the prompt; a reply that doesn't parse is asked for once more, then it rejects. A plain JSON Schema object in place of the shape sends it as is and returns the reply parsed, unchecked.
- `toolLoop(ai, { messages }, { name: { description, parameters, run } }, { signal?, maxSteps? })` runs the model's tool calls, telling it each result (or the error `run` threw), until it answers in text, which it returns; it rejects after `maxSteps` (8) rounds.
- `transcribe(ai, recording, signal?)` returns what a recorded `Blob` (WAV, WebM) says, trimmed, empty for silence; `generateImage(ai, { prompt }, signal?)` returns one picture as an image source (a `data:` URL, else the endpoint's address for it). Each sends the writer's model for it, `ai.transcriptionModel` or `ai.imageModel`; an image request's other fields (`size`) pass through.
- `supports(ai, 'tools' | 'json' | 'logprobs' | 'n' | 'transcription' | 'images')` resolves to whether the writer's endpoint and model take it, so a module can branch before the task instead of catching an error in it. It reads the endpoint's `/models` where that lists `supported_parameters`, else sends one tiny request. An answer is remembered while the settings last; a failure that is about the endpoint or the key rather than the request (no connection, 401, 403, 408, 429, 5xx) is true and not remembered, so the task itself works or reports why. A microphone or paint button is offered only where it is true, or says why on its first refusal (404, 405 or 501).
- A refused request rejects with an `AiError`: `status` is the HTTP status and `detail` the endpoint's own words (`"Model 'x' not found"`), both in `message`.
- **Probabilities of the words the model writes** (next-word percentages, how likely a candidate is): send `logprobs: true` and `top_logprobs` through `ai.fetch('/chat/completions', …)` with `model: ai.model`, and read `choices[0].logprobs.content`. Where `supports(ai, 'logprobs')` is false, the feature greys out with a line saying why; don't stand a prompt's guess in for a probability. The endpoint can't score text the model didn't write (the writer's own words, or an answer under a changed prompt): that is a prompt's judgement, said as such.

`ai.model` is the writer's choice for your module; `chat` and `stream` send it unless the request names another. Don't cap a reply with `max_tokens`: a reasoning model spends the budget thinking and answers with nothing. Ask for the length in the prompt, and cut the reply in your code if it must fit. The writer may add fields to every chat request in Settings (to turn reasoning off, say); a field your request sets wins. Anything else the writer's endpoint offers (spoken audio, embeddings) is `ai.fetch(path, init)`, OpenAI-style paths such as `'/audio/speech'`: the host adds the address and the key, which your module never sees.

Pane code works the same way, `p.with(ctx.ai, …)`. The `with` is for providing: actions inside it grey out with AI off. A component or handler that starts a call reads `ctx.ai.get()` when clicked (and `useStore(ctx.ai)` to grey its button), so nothing from inside the `with` needs copying into a value for your UI to reach. `ctx.ai.get()` reads the current settings anywhere, such as a plugin's timer; turning AI on or off redraws your panes, as setting a value does, so decorations may read it (`ctx.ai.get() ? build(s) : null`). A change to the settings restarts the `with` and aborts its `s.signal`; a call that should outlive that passes `p.signal` instead. The tab of the pane your module is on traces its calls, so the writer sees one that has stalled (a flat line, nothing arriving).

- **A stop is not a failure.** The writer's "Stop AI calls" (pane tab) ends a call with an `AbortError` while your own `signal` stays unaborted, so `signal.aborted` can't tell it from a failure. In a `catch`, `failure(e)` from `mwps/ai` returns `null` for any `AbortError` (clear your status, leave things as they were, never retry) and else the reason in words: `const why = failure(e); if (why) say(`Could not answer: ${why}`);`.
- **A Stop button of your own,** only where the source has one, is an `AbortController`: pass `AbortSignal.any([stop.signal, s.signal])`, and Stop calls `stop.abort()`.

To replace text with an answer, hold its span while the call is out with `heldSpans` from `mwps/text`, and replace it only if its text is unchanged:

```ts
const pending = heldSpans('x-pending', { class: 'x-pulse' }); // top level; the class draws each span
// in the pane: p.provide(pending.plugin)
async function rewrite(p: PaneScope, ai: AiSettings, signal: AbortSignal, from: number, to: number) {
  const id = crypto.randomUUID();
  p.run(pending.hold(id, from, to));
  try {
    const text = await ask(ai, p.state.get()!.doc.textBetween(from, to), signal);
    p.run((s, dispatch) => {
      const r = pending.get(s, id);
      if (!r) return false; // the writer changed it meanwhile
      dispatch?.(s.tr.insertText(text, r.from, r.to));
      return true;
    });
  } finally {
    p.run(pending.release(id));
  }
}
```

A span moves with the text. Typing at either edge stays outside it; typing inside it or deleting it drops it, and it stops being drawn. Hold anything else the same way (targets the writer picked, the source of a chip), with one `heldSpans` per kind: `all(state)` lists a kind's spans in the order they were held. Spans are the pane's and last the session: they start empty when the module is placed or turned back on.

To stream an answer in as it arrives, append each chunk with its own `p.run`, and tag every chunk's transaction with one id for the stream, `tr.setMeta('composition', id)` (a string, such as `` `stream-${crypto.randomUUID()}` ``). The first chunk starts a step and the rest join it, however long the model stalls between chunks. If the writer types mid-stream, the next chunk joins their typing's step. Keep where the stream writes as a position in your own pane plugin's state, mapped with `assoc: -1` (`tr.mapping.map(pos, -1)`), so text the writer types there lands after the stream rather than inside it.

**To anchor an answer to text** (a comment on a quoted sentence), find the quote inside the command you pass to `d.edit`, against the state it is given, so a quote the writer changed while the call was out is dropped rather than misplaced; the command reports how many it placed, for your view to say how many were dropped.

This is the writer's door: they asked for the rewrite, so it is on their undo stack. An analysis the module runs on its own (unattended highlighting, a summary on a timer) is started from a document plugin's view or an effect, and its result is written with `d.edit` (into the document) or into a document plugin's state with a stepless `dispatch` (a meta transaction).

## Drawing on the text

- **Decorations:** a plugin with `props.decorations`. ProseMirror calls it on every redraw: each edit, each selection move, and each time any value of your module is set. If building them costs anything, cache them by `state.doc` (in plugin state, or a `WeakMap` keyed by the doc node); for work per block, a `WeakMap` keyed by the block node, with offsets relative to it, since an edit replaces only the blocks it touches. `Decoration.node` styles a whole block. One inline decoration over text with several marks is drawn as several spans.
- **A decoration that appears** is a new element, so a CSS `transition` never runs on it: fade it in with `@keyframes` or `@starting-style`.
- **Leaving words in the text's own colour:** decorate the words around them, rather than decorating everything and overriding.
- **Hiding text** (`display: none` on an inline decoration) needs a widget at each outer edge of the hidden run (`side: -1` at its end, and one at a block's start when the run begins it), or the caret lands inside the hidden text. Arrow keys across it are a `handleKeyDown`. Text shown in place of other text (a sentence turned into a question) is a widget beside a hidden run that the caret never enters: show the original while the selection touches it.
- **A placeholder** in an empty block of yours is `Decoration.node` with a `data-` attribute, drawn by CSS: `.x-field:empty::before { content: attr(data-placeholder) }`.
- **A plugin reads a value with `get()`** in its props and decorations. Never copy a value into plugin state.
- **A widget with React in it** (a button, a text box, a small card in the margin) is `reactWidget(pos, Component, { key })` from `mwps/react`, returned from `decorations` like any widget. It is drawn as your other components are, in your CSS scope, and drawn once per `key`: read what changes with `useStore`, not from the closure. It sits in the line, so draw inline content or take it out of the flow with `position: absolute` or a float. Don't make the writing's blocks `position: relative` to place it: `.ProseMirror` and the page are what every module's overlays are measured against, so a positioned paragraph moves other modules' margin notes. Float the widget into the margin, or draw a bar as the block's `background`. Keys pressed in it are its own, not the editor's. A widget beside a mark is drawn afresh whenever that mark changes, so a field inside it doesn't edit that mark on every key (see "Text the writer types into an attribute").
- **Your own node types** can have node views (the `nodeViews` prop). Only your own types: another module's are its own to draw.
- **Geometry** (where a position is on screen, what's under a point): a pane plugin's `view(editorView)` gets the pane's view (a component that needs it reads a variable the plugin view sets, and clears in `destroy`), with `coordsAtPos` and `posAtCoords` answered by whichever editor shows the position, and `view.dom`, the pane's element (see "Plugin views on the pane" under "Cards"). `posAtCoords` finds nothing under a layer of yours: set the layer's `pointer-events: none` for the call and back after. Don't call `setProps`, `updateState` or `destroy` on it. To edit from a measurement (heavy-words' falling word), measure from a timer, then pass the result into a command for `p.document.edit`. The command checks the measurement against the state it is given, since the document may have changed, and returns `false` if it no longer fits.
- **Your nodes are editable wherever your module isn't running** (in another pane, or with the module turned off). Protect them with the spec (`atom`, `isolating`, a strict `content`) or repair them in a follow-up. Don't rely on your plugins being there.

### Reading text

Don't walk text nodes and add up their lengths: inline nodes (images, breaks, another module's footnotes) shift the offsets. Use `mwps/text`:

```ts
for (const { node, pos } of ordinaryBlocks(state.doc)) {
  const t = textOf(node, pos); // inline asides left out
  for (const s of splitSentences(t.text)) {
    decos.push(Decoration.inline(t.pos(s.from), t.pos(s.to, -1), { class: 'x-sentence' }));
  }
}
```

`t.pos(offset)` maps an offset back to a document position, and `t.pos(to, -1)` ends a span before any left-out note at its end. Sentences over the whole document, trimmed and in document positions (`{ text, from, to }`, cached by document), are `sentencesOf(doc)`.

**The selected text,** to send to a model or show: `state.doc.textBetween(from, to, '\n\n')`, a blank line between blocks. It includes the text of inline asides (footnotes, margin notes); where that matters, use `textOf` on each block instead. A selection of only spaces isn't empty, so test the trimmed text.

**Which blocks.** The base types (`paragraph`, `heading`, `code_block`, the lists, … in [`schema.ts`](/src/core/schema.ts)) are part of the contract, so testing them by name is fine. Never test another module's types by name. Use what the spec says instead: `isTextblock`, `spec.code`, `atom`, the `inline_aside` group. "Ordinary text" is paragraphs and headings, which skips code and every module's own blocks by construction: `isOrdinary(node)`, and `ordinaryBlocks(doc)` lists them in the writing with their positions. `type.spec.attrs` lists every attribute a type has, including the ones other modules add.

## UI

| Root | Where | Provided on |
|---|---|---|
| `ui.toolbar(C)` | the window's toolbar, for the editor the writer is in | a pane: shows while it is the last focused pane. The module scope: whenever the module runs |
| `ui.side(C)` | a side tab at the window's right, beside the panes: an outline, a feedback list, a chat | as the toolbar |
| `ui.overlay(C)` | over the pane's text: a corner panel, a popover | a pane |
| `ui.selection(C)` | the bubble over a non-empty selection | a pane |
| `ui.modal(C)` | over everything: a dialog, a brush layer | any control scope |
| `ui.tabMenu(action \| C)` | the pane's tab menu | a pane, in an `editorReplacement` module only |
| `ui.projectMenu(action)` | the project tab's menu | a project module |
| `ui.editorReplacement(C)` | in place of the pane's editor | a pane, in an `editorReplacement` module |

Each root takes a component with no props, defined inside the scope so that it reaches the scope's values and pane by closure.

- **Read stores with `useStore(store, selector?)`.** A selector stops the component from redrawing on every keystroke. Its result is compared with `Object.is`, so return a primitive (`(s) => s?.selection.empty`) or a cached object; a fresh object each time redraws on every commit. For a list or an object built from the state, pass an `equals` as the third argument (`useStore(p.state, (s) => linksOf(s), sameLinks)`) rather than returning `JSON.stringify(…)` and parsing it back. Never call `p.state.get()` during render. In effects, timers and event handlers, `get()` is the right way to read the current state.
- **Actions are declared up front, never made from data.** A button per thing the writer makes (a persona, a saved prompt) is the module's own UI, not an action.
- **Buttons that do what an action does** use `useAction` (see "Actions first" above). Clicking a button in the toolbar or the selection bubble leaves the caret in the text. A control that takes focus (a text box, any button in an overlay panel, a widget) calls `p.focus()` when it's done, or the writer's keys, Cmd-Z included, stop reaching the text. The kit's dialogs, popovers and selects do it for you when they close, unless the writer has moved focus elsewhere (a click into the text). `p.focus()` puts the caret back where the pane's selection is, which may be in another card; a control inside a card that should leave the writer in that card calls the card's `handle.focus()` instead. In a box that isn't a `CommitField`, when Enter finishes it call `e.preventDefault()` before focusing: the key's own default runs after your handler, on whatever has focus then, and would split the paragraph. A widget's menu keeps the caret with `onMouseDown={(e) => e.preventDefault()}`.
- **A popover is temporary:** it closes when the writer clicks back into the text or presses Escape, as the kit's `Popover` does by itself. Use one for settings they set and leave (a style, a switch). A result to read and dismiss (a sampled haiku) is a dialog. Never keep one open while the writer types: an open popover takes Escape from the whole window, so the text never sees it. One an action opens is controlled by a pane value, with `PopoverAnchor asChild` on its toolbar button.
- **Every pane keeps its own selection,** focused or not, so UI drawn from the selection (a row of alternatives at the caret's span) shows in each pane unless it reads `p.isLastFocused` too.
- **UI that belongs to one pane's moment** (an open card) closes when the writer moves to another pane: `p.with(p.isLastFocused, (s) => s.effect(() => () => open.set(false)))`.
- **AI calls in flight are the host's to show:** while any of a pane's modules has a call out, the pane's tab shows a dot, and its menu shows the calls and a button that stops them. Show your own status only for what that doesn't say: where the result will land (tint the target), progress through a long job ("turn 4 of 10"), or a reply that was dropped.
- **Anything that stays open while the writer types** is something else. A few numbers or controls go inline in the toolbar: a toolbar item is any component, not only a button. The toolbar is one row; items past its edge are reached by arrows at its ends, so a module whose items grow (a button per saved prompt) needs no overflow of its own. Keep each item small. Floating information about one pane is a corner panel in `ui.overlay`. Anything bigger (a list, a chat) is a side tab.
- **A view that stays open beside the text** (an outline, comments, results) is `ui.side`, provided on the pane it reads. Its buttons leave the caret in the text, as the toolbar's do, so they need no `p.focus()`; its text boxes and selects do. It is drawn only while open, so work that must go on (a timer, fetching summaries) is pane code, not the view's component. Each view is a tab; the writer opens, closes and sizes it, at most two are open at once, and it follows the pane they're in. Fill its slot and scroll inside it. A module with more than one view titles each (`ui.side(Graph, { title: 'Graph' })`); most need one. The writer opens a closed view by its tab, and an action that answers in a view calls `p.reveal(item)` with the item it provided, which opens the tab if it is closed without moving focus. The caret does the same: when the pane's selection moves into one of the module's `dataCards` and its side view is closed, the host opens that view (without taking focus from the card), so an action that puts the caret in a card needs nothing more. Expect a view about 320px wide, and as narrow as 200px. Controls about the view (a level, a filter) go in its own header; actions on the text go in the toolbar or the selection bubble as usual. Unsent input in a view (a half-filled row, a draft message) may live in React state: like a form, it is lost when the view closes or follows another pane.
- **A field that holds more than text** (chips, tokens) may be an `EditorView` of your own, with its own small schema, drawn in your component. It isn't a pane: it has no document, other modules don't run in it, and its edits are on no pane's history. Its keys are its own (`keymap` from `prosemirror-keymap`). Keep what it holds in a value if it should outlive the component.
- **A dialog** is the kit's controlled `Dialog` in `ui.modal`, opened by an action that sets a value. Provide it per pane, with a pane value, so only the pane whose action ran opens it. The module owns opening, closing and Esc.
- **Kit details:** the kit has no checkbox; use `<input type="checkbox">`. A `SelectItem` can't have an empty value, so a "Default" choice needs a value of its own (`'default'`). A pane's toolbar item shows only while its pane is the last focused, so before the writer has focused one it isn't there at all. To move focus into a control an action has just drawn, wait a frame (`requestAnimationFrame`).
- **On the text, or over it?** Anything drawn per paragraph, sentence or span (a strip, a number, a rule, a tint, a note card in the margin beside its words; see "Notes in the margin" below) is a decoration: it scrolls, wraps and reflows with the text, and is drawn wherever the text is. When it holds controls or more than a few elements, make it a `reactWidget` (see "Drawing on the text"). The overlay is for UI that floats over the pane rather than belonging to some words: a corner panel, a popover. Where a layout shows the document in pieces, the overlay floats over the piece the writer is in.
- **An overlay item is unpositioned:** `position: absolute` places it against the page (the frame around the text), so it scrolls with the text, and CSS anchor positioning ties it to the text. Nothing pins it to the pane's visible edge; a control that must stay in view goes in the toolbar or a side tab.
- Build controls from `mwps/ui` so that they match the app and its dark mode.
- **A pane that isn't focused shows its selection** as a faint tint, so a field of yours that takes focus (an instruction box) needs nothing to keep the writer's target in view.
- **Help on hover** (what a section is for, a few examples) is the kit's `Tooltip`: it opens on hover and on keyboard focus. Use a `Popover` only when there is something to do inside it.
- **CSS** is `export const styles = \`…\``, in plain CSS. Tailwind classes do nothing in modules. Prefix class names, `@keyframes` and anchor names with the module id (`.sentence-length-legend`). Respect `@media (prefers-reduced-motion: reduce)`.
- **Your styles apply where the module is placed:** inside each pane it is placed on, and inside its own UI. `:scope` is the pane's page, the frame around its text; `:scope:has(.x-on) { … }` styles it only while something of yours is shown.
- **Margins are the page's,** and cards have no page: a strip or mark drawn in the margin is cut off in a card. Draw it inside the block (a node decoration with `padding-left` and a `::before`) to show everywhere.
- **Room beside the text.** The page is as wide as its text plus its margins. Ask for a margin by setting `--mwps-margin-right` (or `--mwps-margin-left`) on `:scope`, and the page widens while the text keeps its width; `--mwps-text-width` sets the text's width itself. When the page is wider than the pane, the pane scrolls sideways and the text stays at the left of the view, so don't hide margin content for a narrow pane. Two modules asking for the same side: the last one wins.
- **Notes in the margin, level with their words and never overlapping,** are floats: a `reactWidget` at the end of the note's span, styled `float: right; clear: right; width: 200px; margin-right: calc(-1 * var(--mwps-margin-right))`. The browser puts each at its line and pushes a note below the one before when they'd collide, so there is nothing to measure. A narrow pane scrolls sideways to reach them.
- **Style only what the function needs**: layout, scrolling, a drag handle's cursor, an element's bounds, a state the writer must see (focus, selected, a mode). The kit and the theme give everything its look; shadows, fonts and decorative colour are left out.
- **Colour comes from the theme's variables**, so the module follows light and dark mode: surfaces `var(--background)` and `var(--muted)`, text `var(--foreground)` and `var(--muted-foreground)`, lines `var(--border)`, a badge or emphasis `var(--primary)` with `var(--primary-foreground)`, focus `var(--ring)`, danger `var(--destructive)`. No hex for surfaces or text, and don't override the variables for a subtree. A colour that carries meaning (a highlight, a link's line) may be fixed if it reads on both. **An item's own colour** (a character, a feedback type, a field) is worked out when it is drawn, from its position or id, as a hue that reads on both (`hsl(var(--x-hue) 80% 55% / 0.15)` for a tint); store a colour only where the writer picks it.

**Motion that is only a view** (drifting bubbles, a card following the pointer) lives in the component: a `useLayoutEffect` running a `requestAnimationFrame` loop that writes `style.transform` directly, so React doesn't redraw each frame, with positions in a `useRef`. Stop the loop under `matchMedia('(prefers-reduced-motion: reduce)')`.

**When things draw.** All of these happen in one frame, in this order: values, scopes and plugin lists; ProseMirror's states and DOM (a pane showing cards draws them where it would draw its editor); effects and plugin views; React; then paint. React code may read ProseMirror's DOM. Measure DOM that React draws in `useLayoutEffect`, never from a plugin view. `useStore` never tears. A component can outlive its scope by one render, and `p.run` returns `false` during it.

## Replacing the editor

An `editorReplacement` module draws something in place of a pane's editor: a split, a canvas of cards, a painting. It declares `export const moduleType = 'editorReplacement'`. A pane has at most one; choosing another replaces it. While the replacement shows, the other modules placed on the pane run where the writer writes: in the pane itself while it shows its blocks as cards, in its child panes, or nowhere if it shows no text. A module that replaces the editor only sometimes is still typed `editorReplacement`. It provides `ui.editorReplacement` inside a `with` and puts the switch in its tab, which every layout has:

```tsx
const on = p.getValue(onKey);
p.provide(actions.cards, { procedure: () => (on.set((v) => !v), true), active: () => on.get() });
p.provide(ui.tabMenu(actions.cards));
p.with(on, (s) => {
  const cards = s.hostPartPanes((node) => node.isTextblock);
  s.provide(ui.editorReplacement(Canvas));
});
```

A replacement that is always on (a canvas that is the whole point of the module) needs no switch: placing the module is the switch.

**The tab is the replacement's, for controls that change the layout:** what the pane shows (on or off, a mode), its arrangement (resizable-split's "Side by side | Stacked" `ToggleGroup`), its panes (Close pane). Put them in `ui.tabMenu`: actions, which the host draws, and components for what an action can't express. **Controls for working in it** (a tool, an action on the canvas or the text, undo for the canvas, a field the module's prompts read) go in the toolbar, as any module's do: it shows the pane's items while the writer is in the pane, its cards or its canvas. While the writer is in a child pane, the toolbar is the child's, so a layout of child panes has only the tab.

### Child panes

`p.hostChildPanes({ persist: true })` makes the pane a host and returns its children. Each child is two things:

- a **handle** in `children.list`: what you draw (`handle.element`, placed once, keyed by `handle.id`) and close (`handle.close()`). It lasts from `create` until it closes.
- a **child pane**, the `PaneScope` that `each` gives. It shows one document, so a new child pane replaces it when the handle switches document. You configure it here: plugins, actions, the child's tab menu.

`each` hands over both, so you never match them up. The split's Close pane, from [`resizable-split`](/modules/resizable-split/index.tsx):

```tsx
const children = p.hostChildPanes({ persist: true });
while (children.list.get().length < 2) children.create({ owner: 'writer', document: null });
p.each(children, (c, handle) => {
  c.provide(actions.closePane, { procedure: () => (handle.close(), true) });
  c.provide(ui.tabMenu(actions.closePane));
});
const Split = () => <div className="x-split">{useStore(children.list).map((h) => <div key={h.id}>{h.element}</div>)}</div>;
p.provide(ui.editorReplacement(Split));
```

- **`owner`** says who a child belongs to. A `'writer'` child is a pane like any other: it has its own tab, the writer picks its document and modules, and it starts with a copy of the host's, taken once when it is made. A layout whose children are all writer-owned runs no add-ons of its own, so its tab offers none. A `'module'` child (the default) shows the document you gave it and runs the host pane's modules; it has no tab. giblets-file has both kinds: its main editor is module-owned, and its grave is writer-owned, picked with the document picker. Tell them apart by `handle.owner`, because persisted children come back in no fixed order.
- **With `persist`**, children come back after a reload with their ids, documents, modules and values. Create only what's missing (`while (… < 2) create(…)`).
- **Read a child's document from its child pane** (`c.documentId`, fixed for the scope), never from a value that copies it. Checks about it run once in that scope. giblets-file checks there that the grave isn't the main document, and shows its note in the grave's own overlay.
- **Writing into a child as the writer** is `handle.run(command)`, on that child's history. A replacement that sets one editor of the whole document beside a view of its own (an outline, a graph) runs the writer's gestures from that view through the editor's handle, so Cmd-Z in the editor undoes them.
- **Focus** stays where it lands. To move it into a child (placing a split focuses its first pane), call `handle.focus()` from an effect while `p.isLastFocused.get()`.
- **Your own children aren't in your `ctx.panes`.** The kit's `ResizablePanelGroup`, `ResizablePanel` and `ResizableHandle` give draggable dividers.

### Cards

A card is an editor over a piece of the pane's document: a parent node and a range of its children. Its document is a copy of the parent holding that range, and the children are drawn as themselves (the card's frame stands in for the parent). The pane's own editor is one, over the writing's blocks. A layout asks for more with `p.hostPartPanes((node) => boolean)`: the writing's matching blocks as cards, one per block, in document order (a whole list or quote is one block, so one card), each `doc(block)`. A module shows its data with `p.dataCards(type)`: one card per node of that type, whose document is the node with all its children (see "Where data goes"). The document decides which cards exist: there is no `create` or `close` (to remove a card, delete its block or node), and nothing persists. `cards.list` holds a `PartHandle` per card: `element` to place (keyed by `id`), `part` (where its block, or its data node, starts now), and `state`, `run` and `focus` for the card's chrome.

- **A card is a piece of the pane's editor, not a pane.** The writer is in the host pane while in a card: the selection, `p.state` and the history are the pane's. The other modules placed on the pane keep running there, in document positions, as if the layout weren't on. Their keys, input rules, paste handlers, decorations and node views work in the cards.
- **What the writer makes in a card stays between its ends.** An edit outside them, or a selection ending outside them, is refused: Backspace at a layout card's start doesn't join it to the block before, and Cmd-A then Delete in the main editor or a data card can't reach past it. Enter splits a layout card's block, and the second half becomes a new card, with the caret in it.
- **Gestures on the canvas** (moving a card, a link between cards) are commands on the host pane with `p.run`. Moving a block is one transaction that deletes it and inserts equal content; the host recognises this as a move and keeps the card, caret included.
- **A gesture that changes only data** (a saved position, a link) sets attributes with `tr.setNodeAttribute(pos, name, value)`, leaving the block's content alone.
- **Undo.** There is one history, the pane's: typing in cards and gestures on the canvas are steps on it. Each gesture run with `p.run` is its own step; a gesture that shouldn't be undone carries `tr.setMeta('addToHistory', false)`. A canvas may also offer undo as toolbar buttons: `undo` and `redo` from `prosemirror-history` as `{ command }` actions with no keys, drawn with `useAction` (they grey out when there's nothing to undo).
- **A card's `element` is as tall as its block**, with the editor's type styles and no page frame or padding. The card box the module draws around it decides its size: a fixed-size card scrolls its own body (`overflow: auto`), a bubble grows with its text.
- **Draw the cards in a fixed order** (by `id`) and place them with CSS, taking each card's number from its index in `cards.list`. Drawn in document order, a reorder makes React move a card's DOM node, which drops a drag's pointer capture.
- **Positions** are the document's everywhere except `handle.state` and `handle.run`, which see the card's own document: a position `pos` there is `handle.part + pos` in the document for a layout's card, `handle.part + 1 + pos` for a data card.
- **Whole-document data on the canvas** (links between cards) comes from `p.state`, which also changes on every keystroke in a card. Select only what the canvas draws, with an `equals` that ignores the rest, so typing doesn't redraw it. `cards.list` is in the same order as the matching blocks of `p.state`'s document.
- **A card's own chrome** (a header with a number, a checkbox for an attribute) reads its block from the handle, `useStore(handle.state, (s) => s?.doc.firstChild?.attrs.x)`, and edits it with `handle.run`.
- **Putting the writer in a card** (a new card, after "New card") is `handle.focus()` from an effect, once the card is in `cards.list`. It moves the pane's selection into the card.
- **The pane's overlay and selection bubble** are drawn in the layout's card holding the caret (the first card when the caret is in none). A data card (`p.dataCards`, in a side tab) never holds them: with the caret there, they stay on the pane. An overlay item there anchors only to text in that card, and is drawn afresh when the caret moves to another card, so keep its state in a value.
- **Plugin views on the pane** are one per pane, whatever cards it shows, starting and ending with the pane. Their `view` stands for the pane: `view.state` and `view.dispatch` are the pane's, and position methods (`coordsAtPos`, `posAtCoords`, `domAtPos`, `posAtDOM`) answer from the card showing the position. `view.dom` is the pane's own element, for measuring and finding the scroll box: it holds a layout's chrome and isn't editable, and a data card in a side view is outside it. So listen with `props.handleDOMEvents` and ask `view.posAtDOM` (it throws for a node in no card), not `view.dom.addEventListener` or `view.dom.contains`, which `npm run check` warns about. The text's own box is the `.ProseMirror` inside `view.dom`.
- **Actions provided on the host pane work from inside a card**, since the writer is in the host pane: the cards' on/off key works with the caret in a card.

## The project

`ctx.project` is present while the module has project access, which every module has until the writer takes it back. Work inside `ctx.with(ctx.project, (s, project) => …)`. `project.documents` lists the documents. `create`, `rename`, `edit` and `read` are async and resolve to `null` or `false` once access has ended. `project.edit(id, command)` also works on a closed document: the command gets a plain state, with no plugins and no history, and the result is saved. `project.read(id)` returns a document as it is now, without editing it. For documents your panes show, use `d.edit`.

A **project module** (`moduleType: 'project'`) has only the module scope. It works through `ctx.project`, and its only UI is `ui.projectMenu` and `ui.modal`: export the whole project, or ask for words in a dialog and rename across documents.

## Recipes

**A timer that edits:**

```ts
ctx.each(ctx.documents, (d) => {
  d.effect(() => {
    const id = setInterval(() => d.edit(step), 1000);
    return () => clearInterval(id);
  });
});
```

**A read-only pane:** a plugin with `props: { editable: () => false }`. Every edit made in the pane is refused, and its command actions grey out. Edits from other panes and from `d.edit` still arrive, because read-only belongs to the pane, not the document.

## When something goes wrong

A notice to the writer ("the reply was dropped") goes in your own UI, such as the status line or view the request came from; the host's toast is only for a module that failed. Any exception from your module turns it off everywhere and shows a toast naming it; the rest of the app keeps working. This covers setup, effects, plugin hooks and components. The stack trace is in the browser console. `npm run check` catches type and import errors and what the host refuses at install (type names, clashes, the schema); it doesn't run `setup`, and a mistake React finds at run time (an effect that returns a value) turns your module off the first time it draws, so try every view in a browser. Throw on real bugs rather than swallowing them, but let code paths the writer can reach normally return quietly: no sentences, an empty document, a pane showing no document (`p.document` is `null` and `p.state.get()` is `undefined`: provide nothing that needs a document there, or a one-line note in your own view), a position that can't take text.

## Porting from a description

When you write a module from its `description.md`:

- Build what the **Brief** says. It is the spec; where another section disagrees with it, the Brief wins. A "Changes" section adds to it. Sections that describe an earlier implementation or a paper's system are background: take their numbers and rules where the Brief asks for them, never their structure.
- For each **Open question**, take the recommendation unless it contradicts this guide. List every call you made that the description didn't settle.
- Don't change `description.md`. Update `qa.md` if a step no longer matches what you built.
- If the contract or this guide doesn't let you do something the description asks for, say so rather than working around it with private host code or globals. That is a gap to fix in the framework.
