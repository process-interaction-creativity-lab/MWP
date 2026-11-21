# QA: card-links

About five minutes. Use a document with at least five paragraphs. Open a second pane on the same document, in a plain editor.

1. Open the document in a pane using the card-links layout. Confirm one numbered card per block, in document order, and the canvas scrolls when you shrink the pane. Type in a card and confirm the text shows in the second pane.
2. Drag a card elsewhere. Confirm it stays where you dropped it, and that cards you have not moved stay in their own grid slots (moving card 1 must not drag card 2). Reload and confirm positions are kept.
3. Choose "Undo canvas edit" in the pane's tab menu. Confirm the move is undone as one step; "Redo canvas edit" redoes it, and both grey out when there is nothing left.
4. Draw a link: drag from a card's link button and release on another card. Confirm a banner shows while dragging, a dashed preview follows the mouse, and on release a curve and an empty label placeholder appear. Click the label to select it, click a second card to add it as a target, and confirm a curve to each. Start another drag and press Escape, or release on empty canvas, and confirm nothing is created.
5. Double-click a label, type a name and press Enter. Confirm it saves. Edit it again and press Escape, and confirm the old name stays. With the link selected, click a card that is already a target and confirm there is no duplicate.
6. With a link selected, press Delete and confirm it goes (but not while editing a label). Undo it from the tab menu and confirm it returns with its label and targets.
7. Delete one target's block text entirely in the second pane. Confirm the link keeps its other targets, and when the last target is deleted the link disappears with no error. Press Enter in a card and confirm it doesn't split. In the second pane, press Enter in the middle of a moved card's paragraph and confirm the new card is in a free slot, not stacked on the old one, and the links stay on the first.
8. Turn the module off and on. Confirm the plain editor returns, then the canvas comes back with links and positions intact.
