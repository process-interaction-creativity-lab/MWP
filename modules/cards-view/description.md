# cards-view: description

Turns a pane into a corkboard with one editable card per paragraph, heading or list. Drag cards around, and the order they end up in, left to right and top to bottom, becomes the order of the document. Switch back to the normal editor at any time.

For a writer who wants to see a draft as a pile of pieces and rearrange it by hand: scene cards, index cards.

**Kind:** editorReplacement. When switched on it shows the document as a canvas of cards in place of the page; placing the module adds a switch, off at first, so the pane stays a plain editor until the writer turns it on.

- **The switch.** "Toggle Cards View" (Mod-Alt-k) is in the pane's tab menu and the palette. It belongs to the pane and is remembered across reloads; a second pane on the same document is not affected. It works with the caret inside a card.
- **One card per block,** in document order, except horizontal rules, which get no card. Each card shows a number: its place in the reading order. Cards are laid out in a grid in document order, with columns following the pane's own width, and the canvas scrolls when cards run past the edge. It follows the light or dark theme, with cards standing out from the canvas.
- **Editing.** Each card is a live editor of its block, and the other modules placed on the pane work in it. Typing edits the document. Edits made elsewhere (another pane, another module) show in the cards live, and a card keeps its caret.
- **A card is one block, and blocks make cards.** Enter in a card splits it: the second half becomes a new card next to it, with the caret in it, and pasting several paragraphs makes a card for each. Backspace at a card's start does nothing (cards don't join). A "New card" control (an action, also in the tab menu) adds an empty block after the focused card's block, or at the end, and its card takes the caret. A new card, from there or from another pane, appears next to the card that precedes it in the document, not in a corner.
- **Dragging.** Dragging a card by its header moves it freely. When the drag changes the reading order (rows by top edge, a row's cards left to right), the document's block order changes at once, moving only the dragged block; other cards keep their caret and state. A drag is not on the undo stack, so undoing later doesn't replay moves; to undo one, drag the card back.
- **Resizing.** Each card has a resize handle at its bottom-right corner. A card made bigger pushes the cards it would overlap out of its way (in its row to the right, below it down, and on from there), just far enough; no other card moves and the document's order doesn't change.
- **Deleting.** An × on each card's header deletes its block, as one undo step, and the caret goes to the card before it (the one after, for the first). Deleting the last card leaves one empty card. *Delete card* is also an action, for the card the writer is in.
- **Positions and sizes are not saved.** On a reload, or on switching back on, cards are laid out afresh in rows, at their default size.
- **Switching off** leaves the document exactly as it is: nothing is deleted, no empty block (including other modules' blocks) is dropped, and the blocks are already in the cards' order.
- **Module off.** The plain editor returns with the document intact.

Unlike card-links, it can switch off and its drags reorder the document; it has no links between cards.
