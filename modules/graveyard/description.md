# graveyard: description

Words you delete are collected in a graveyard kept in the same document, one entry per cut, so your cuttings travel with the file. Undo restores the word and removes its entry together. The graveyard is the module's data: it never shows in your writing.

**Kind:** extension. It keeps data in the document and leaves the pane as it is.

For a writer who cuts a lot while drafting and hates losing a phrase for good. Nothing to set up.

- **What gets buried.** A word is buried only when the whole word was deleted, whether by selecting it or by Backspace or Delete letter by letter. Deleting part of a word buries nothing. A selection of two or more characters is buried as one entry, with whitespace collapsed. Typing, Enter, joining paragraphs and moving the caret bury nothing.
- **The graveyard.** It starts on the first burial: one entry per cut, in deletion order. Nothing of it shows in the writing, and select-all, Delete or Backspace in the writing never reach it.
- **Undo is one step.** Cmd-Z after a deletion brings the word back and removes its entry together; redo does both again. Undoing typed text buries nothing.
- **Only the writer's own deletions count.** Edits by other modules never bury. A deletion made in one pane is buried once, for every pane on the document. Moving paragraphs (for instance reordering cards) buries nothing.
- **Data.** The entries travel with the file. Nothing else is kept.
- **Turning the module off.** The graveyard stays in the document, kept and saved and unshown, and deletions bury nothing; turning it on carries on burying into it.
