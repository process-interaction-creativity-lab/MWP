# QA: giblets-file

About five minutes. Have at least two documents in the project, with a few lines of text in the first.

1. Open the first document in a pane using the giblets-file layout. Confirm you see the editor plus a giblets column that invites you to pick a document. Click the column, hover the toolbar's document picker and confirm the column is outlined, then pick the document you are editing and confirm the column says it can't bury into it, and that deleting a word buries nothing.
2. Pick the other document. Confirm it shows in the column as an editable document. In the main editor, select one whole word and delete it. Confirm it appears once, as its own paragraph at the end of the giblets document.
3. Type "big cat" at the end of a line, then Backspace one letter at a time. Confirm nothing is buried until a whole word has gone, then "cat" appears, then "big". Repeat with forward Delete from the start of a word.
4. Delete only part of a word (the last letters of "hello", or start mid-word and backspace to the line start). Confirm nothing is buried. Then select several words, across two paragraphs if you can, and delete. Confirm they appear as ONE paragraph with single spaces. Also try pasting over a selection: the replaced text should be buried.
5. Undo a deletion and redo it. Confirm the text returns and goes again, and that neither undo nor redo adds an entry. Type text and press Enter, and confirm nothing is buried.
6. Type and delete words inside the giblets editor. Confirm nothing new is appended. Close the column and confirm the editor fills the pane and a button remains to reopen it; reopen it and confirm the same document is still picked and the main caret was not lost. Drag the divider and confirm both sides scroll on their own.
7. Open a second pane on the same document and choose a different giblets. Delete a word in the first pane and confirm it is buried only in the first pane's giblets, once. Delete a word in the second and confirm the reverse.
8. Turn the module off and on. Confirm the plain editor returns, then the split comes back with the previous giblets still picked. If you can, delete the picked giblets document and confirm the column returns to asking you to pick.
