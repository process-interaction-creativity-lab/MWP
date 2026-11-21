# cards-view: help

You want to see a draft as a pile of pieces and rearrange it by hand, like index cards on a corkboard. This module gives a pane a canvas with one editable card per block.

## What it gives you

- **Toggle Cards View** (palette, the pane's tab menu, or **Mod-Alt-k**): switches the pane between the normal editor and the cards. It starts off.
- **Cards** (the canvas): one live card per paragraph, heading or list, numbered in reading order. Horizontal rules get no card.
- **New card** (button at the top of the canvas, palette, tab menu): adds an empty block after the focused card, or at the end, and puts the caret in it.
- **Delete card** (palette, and the **x** in a card's header): removes that block. The caret moves to the card before it.
- **Drag a card** (by its header): moves it freely; the document's order follows the cards' reading order.
- **Resize handle** (a card's bottom-right corner): makes the card bigger and nudges neighbours out of the way.

## Walkthrough

1. Open a document with a heading and a few paragraphs, then turn on cards-view in the pane's tab menu.
2. Choose **Toggle Cards View** from the tab menu or press **Mod-Alt-k**. Each block becomes a numbered card.
3. Click into a card and type. It is your document you are editing.
4. Press **Enter** mid-card: the second half becomes a new card beside it, with the caret in it. Backspace at a card's start does nothing; cards don't join.
5. Click **New card** to add an empty one, and write something.
6. Drag the last card by its header to the front. The numbers update, and the document's order changes at once.
7. Drag a card's bottom-right corner to enlarge it, then click the **x** on a card you don't need. Cmd-Z brings it back.
8. Toggle off to return to the plain editor, with the blocks already in the cards' order.

## How the pieces fit

The cards are a different view of the same document: editing, adding and deleting cards edit the blocks, and the left-to-right, top-to-bottom order of the cards is the order of the text. Whether the pane shows cards is remembered, but card positions and sizes are not; they are laid out afresh in rows on reload.

## Tips

- Moving a card isn't on the undo stack. To undo a move, drag the card back.
- Deleting the last card leaves one empty card.
- Other panes on the same document stay plain editors unless you switch them too, and see your edits live.
- Other modules placed on the pane work inside the cards.
