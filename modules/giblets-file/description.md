# giblets-file: description

Words and passages you delete are quietly added to a second document you choose, shown in a column beside your editor. You can read it, edit it, and copy text back out, or fold it away for full width. Partly deleted words are not saved.

For a writer who cuts a lot while drafting and hates losing a phrase for good. The column is labelled "Giblets"; the document shown there is the giblets document. (graveyard is the one-document form of the same idea.)

**Kind:** editorReplacement. The pane shows two documents side by side, the writer's editor and the picked document, which no extension can do; placing the module is the switch.

- **The column.** The pane splits into the normal editor and a giblets column. The writer picks the giblets document with the toolbar's document picker while the column is focused (click it first; hovering the picker outlines the pane it will switch). Until one is picked the column says so and invites picking; deletions are then not recorded, and nothing errors. Picking the document being edited buries nothing and the column says why. If the picked document goes missing, the column returns to the pick-a-document state.
- **Editable.** The giblets document is an ordinary editable document in the column; editing it never buries anything.
- **A word is buried only when the writer deleted the whole word,** by selecting it or by backspacing or forward-deleting it letter by letter. Deleting part of a word buries nothing, even if the rest of the word is deleted later. Backspacing "big cat" gives "cat", then "big". Typing, Enter, joining paragraphs and moving the caret bury nothing and abandon any half-finished word.
- **Deleting a selection of two or more characters** buries the removed text as one entry, every run of whitespace (paragraph breaks included) collapsed to one space, even when a paste replaces the selection.
- **Entries.** Each entry is a new plain-text paragraph at the end of the giblets document, in deletion order.
- **Whose deletions count.** Only the writer's own edits in this pane's editor. Undo and redo never bury, and neither do edits from another pane, another module, an agent or a collaborator. Undoing a deletion leaves its entry: the giblets document is a log, so the writer removes an entry by editing the document.
- **Resizing and closing.** The column can be dragged wider or narrower and can be closed. Closed, the editor takes the full width and a small button in the pane's corner brings the column back with the same document picked. None of this costs the main editor its caret or selection. The corner button doesn't overlap the app's own document and module selectors.
- **Remembered.** The picked document and whether the column is open belong to the pane and survive reload. Two panes on one document each keep their own choice and bury only their own deletions.
- **Module off.** The plain editor returns; the entries stay in the giblets document. Turning it on again restores the split with the same document picked.
