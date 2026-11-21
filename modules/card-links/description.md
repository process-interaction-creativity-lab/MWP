# card-links: description

Shows your document as a canvas of cards, one per block, that you can edit and drag wherever you like. Draw labelled links between cards, such as causes or contradicts, to map how parts of a piece connect. Positions and links are saved with the document.

For a writer working out how the parts of a piece connect: a plot, an argument, notes toward an essay.

**Kind:** editorReplacement. It shows the document as a canvas of cards in place of the page; placing the module is the switch (use another pane, or turn the module off, for the plain editor).

- **Cards.** One card per block, in document order, except horizontal rules. Each card has a number (its place in the document), a drag handle and a link button. Typing in a card edits the document, edits from other panes show live, and the other modules placed on the pane work in the cards. A card is one block: Enter doesn't split it. A "New card" control (also in the tab menu) adds an empty block at the end, as a new card. The canvas scrolls when cards or links run past the edge and works at any pane width.
- **Moving.** Dragging a card by its handle moves it. The position is saved with the document when the drag ends, so it is the same after a reload and for anyone who opens the file. A card with no saved position sits in the grid slot for its place in the document, so moving one card never moves the others. A pasted or split copy of a positioned block takes a free slot instead of stacking on the original and doesn't inherit its links.
- **Linking.** Drag from a card's link button and release on another card. A banner says what is happening, a dashed line follows the pointer, and Escape, or releasing on empty canvas, creates nothing. A link goes from its source card to one or more target cards, drawn as curves with a label at the middle of the cards it touches; a new label is empty and shows a placeholder. A card may be the source of several links, each with its own label. Cards of another module's block types still get a card and a grid slot but can't be moved or linked.
- **Labels and targets.** Double-click a label to edit it (Enter or clicking away saves, Escape cancels). Clicking a label selects the link; then clicking more cards adds them as targets (never the same one twice). The close button on the label, or Delete or Backspace (not while editing the label), removes the link.
- **Links follow cards.** Deleting a card removes its links; deleting a target removes that target, and the link goes when none are left. Nothing errors.
- **Undo.** Moves, link edits and typing are steps on the pane's one undo history, so Cmd-Z undoes them in order. "Undo canvas edit" and "Redo canvas edit" are in the pane's tab menu and the palette, greyed when there is nothing to undo or redo.
- **Data.** Positions and links travel with the file and show in every pane on the document, whether or not this module is placed. Edits to different cards don't collide.
- **Module off.** The plain editor returns, and the canvas comes back with positions and links intact when the module is placed again.

Unlike cards-view, dragging never changes the document's order; it adds links between cards.
