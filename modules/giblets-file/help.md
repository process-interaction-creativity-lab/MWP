# giblets-file: help

You cut a lot while drafting and hate losing a phrase for good. This module keeps every word and passage you delete in a second document, shown in a column beside your editor, so nothing is gone for good.

## What it gives you

- **The Giblets column** (beside the editor): a second, ordinary document you can read, edit and copy text out of. It has its own document picker.
- **Pick a document** (the column's picker): chooses where deletions go. Until you pick one, the column asks you to, and deletions are not recorded. Picking the document you are editing buries nothing, and the column tells you why.
- **Buried words** (the column): when you delete a whole word, by selecting it or by backspacing or forward-deleting it letter by letter, it is added as a new paragraph at the end of the column's document. A selection of several words is added as one paragraph, with spaces collapsed.
- **Show giblets** (pane tab menu; palette action; also the **⚰** button in the pane's corner when the column is closed): opens or closes the column.
- **Close giblets** (the **×** in the column header): folds the column away so the editor has the full width.
- **The divider** (between editor and column): drag it to make the column wider or narrower.

## Walkthrough

1. Open the pane's tab menu and choose the giblets-file layout for the pane. You see your editor and a Giblets column asking you to pick a document.
2. Pick another document in the column's picker. It shows as an editable document.
3. In your editor, select one whole word and delete it. It appears at the end of the column.
4. Type "big cat" and press Backspace letter by letter. Nothing is buried until "cat" is fully gone, then "cat" appears, then "big".
5. Delete only the end of a word: nothing is buried. Select several words across two paragraphs and delete them: they arrive as one entry.
6. Press Cmd-Z. Your text returns and the entry stays, because the column is a log. To remove an entry, edit the column's document.
7. Click **×** to close the column, then **⚰** to bring it back with the same document picked. Drag the divider to resize.

## How the pieces fit

The editor and the column work as a pair: what you cut goes into the document you chose, and you take it back by copying from the column. Only your own deletions in this pane count; undo, redo, typing, Enter and edits from elsewhere bury nothing, and editing the column never buries anything. The picked document and whether the column is open are remembered per pane and survive a reload. Turn the module off and your plain editor returns; the entries stay in their document.

## Tips

- If the picked document is deleted, the column goes back to asking you to pick one.
- Two panes on one document can use different giblets documents and each buries only its own deletions.
- Partly deleted words are never saved, even if the rest of the word goes later.
