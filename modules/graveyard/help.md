# graveyard: help

You cut a lot while drafting and hate losing a phrase for good. This module quietly keeps every word you delete in the same document, so your cuttings travel with the file. There is nothing to set up and nothing to click.

## What it gives you

- **Burying** (the text itself; no button, no tab, no palette action): when you delete a whole word, it is saved as an entry in the graveyard. You'll see nothing change in your writing.
- **One entry per cut**, in the order you deleted them. A selection of two or more characters is saved as a single entry.
- **Undo and redo** (**Cmd-Z**, **Cmd-Shift-Z**): undoing a deletion brings the word back and removes its entry in the same step; redo does both again.

## Walkthrough

1. Turn the module on in the pane's tab menu. Nothing appears; that is expected.
2. Select a whole word and press **Delete**. The word is buried.
3. Type "big cat" and press **Backspace** letter by letter. When the whole of "cat" is gone it is buried, then "big" when that is gone. Deleting only part of a word buries nothing.
4. Select a whole sentence and delete it: one entry.
5. Press **Cmd-Z**: the sentence returns and its entry goes with it.
6. Save the file. Your cuttings are saved inside it and come back when you reopen it.

## How the pieces fit

The graveyard is data kept with the document, not something drawn in it. It never shows in your writing, and select-all, **Delete** or **Backspace** in the text never reach it. Only your own deletions count: typing, **Enter**, joining paragraphs, moving the caret, other modules' edits and moving paragraphs around bury nothing. With several panes on one document, a deletion is buried once.

## Tips

- This module has no screen of its own, so the entries can't be read inside the app; they travel in the saved file.
- Turning the module off keeps the graveyard in the document, but deletions bury nothing until you turn it on again.
- Undoing typed text buries nothing.
