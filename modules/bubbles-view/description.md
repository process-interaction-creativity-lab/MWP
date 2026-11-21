# bubbles-view: description

Shows your document as small bubbles drifting around a field, one per paragraph, instead of a page. Each bubble is editable, and typing in it changes the document. A bubble holds still while you work in it. Bubbles stay put if your system asks for reduced motion.

For a writer who wants to loosen up and reread a draft as separate thoughts, without the weight of the whole page. A playful, low-pressure view.

**Kind:** editorReplacement. It shows the document as pieces in a field of its own, in place of the page; placing the module on a pane is the switch.

- **One bubble per block.** Every top-level block gets exactly one bubble, in the same document and not a copy. Nothing is hidden: headings and list items are bubbles too.
- **Editable.** Typing in a bubble changes the document. The toolbar, the other modules placed on the pane and their shortcuts work inside a bubble as they do in the plain editor. Cmd-Z undoes typing as usual.
- **A bubble is one block.** Enter doesn't split it and Backspace at its start doesn't join it to another. New paragraphs come from other panes on the document, and appear as new bubbles.
- **Size.** A bubble has a fixed width; its height grows with its text up to a cap, then it scrolls inside.
- **Drifting.** Bubbles drift slowly and bounce off the edges of the field; they never leave it or become unreachable. They may pass over one another. A bubble the writer is working in stands still while it has focus and drifts again when focus leaves.
- **Coming and going.** A bubble for a new block appears in the field at a starting place, away from other bubbles where there is room; a deleted block's bubble goes.
- **Reduced motion.** With the system's reduced-motion setting on, bubbles stay put.
- **Where bubbles are is not saved.** It has no effect on the document; after a reload bubbles are in fresh places.
- **Two panes on one document.** Edits in either show in the other; a second pane without the module is a plain editor and stays responsive while bubbles drift.
- **Module off.** The normal editor returns with the same text, intact.
