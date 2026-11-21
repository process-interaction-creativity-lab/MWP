# hemingway-pen: description

Switch on a pen, then drag the mouse over your text like a paintbrush. Every adjective and adverb the brush touches is deleted, along with the punctuation after it, leaving a fading trail of red and purple paint. The pen is always off when the app starts.

**Kind:** extension. It adds a tool over ordinary panes; they keep showing their own documents.

For a writer who over-uses adjectives and adverbs and wants to strike them out with a flourish rather than hunt for them.

- **The switch.** A toolbar toggle and a palette entry turn the pen on and off. It is never on when the app starts, and nothing is remembered: an app that opens with every editor covered would be a trap. Escape also turns it off.
- **While it is on.** A transparent painting layer covers the whole window, toolbar included, and the pointer is a crosshair. Clicking, dragging and the mouse wheel do not reach anything beneath, so a stroke cannot select text, move the caret or scroll the page; Escape turns it off. Turning the pen off (or turning the module off) removes the layer at once and gives the page back.
- **Painting.** Pressing the mouse and dragging leaves paint splashes along the stroke in two shades (red and purple), which fade within a couple of seconds. Moving off the layer or releasing the button ends the stroke. The paint is decoration only and never touches the document.
- **Striking.** A stroke over a word that is an adjective or an adverb deletes it. The deletion takes the whitespace and any separating or closing punctuation directly after it (comma, semicolon, colon, closing bracket or quote), so no orphaned comma or double space is left; a sentence's final full stop, question mark or exclamation mark is kept. A small red flash marks each removal.
- **What counts.** Only words. Nouns, verbs and the rest are left alone, as is anything that isn't a word (punctuation, numbers, the gaps between words, a lone letter). A hyphenated compound such as "well-known" is one word, struck whole if it reads as an adjective or adverb as a whole. Text that belongs to other modules (notes, alternatives) is never struck.
- **A best guess.** Which words are adjectives or adverbs is a best-effort guess from one word at a time, without sentence context. Misses and mistakes are expected, but it never fails.
- **Panes.** The word under the pointer is found in whichever pane the pointer is over. With several panes showing, one stroke can cross them.
- **Undo.** Each struck word is the writer's own edit on that pane's undo stack: Cmd-Z brings struck words back one at a time, and redo strikes them again.
