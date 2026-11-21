# document-viewer: description

Makes a pane read-only so you can look at a document without changing it by accident. You can still scroll, select and copy, but typing, pasting and toolbar actions do nothing. Only that pane is locked, and the same document stays editable in other panes.

For a writer who wants to look at a document without changing it by accident: a finished piece, a reference text beside the one being drafted, a reading copy.

**Kind:** extension. It changes what an ordinary editing pane allows, and says so: "Read-only" in the toolbar while the pane is focused.

- **No edit gets through this pane.** Typing, deleting, cut, paste, drag and drop, formatting keys, toolbar buttons and palette actions do nothing; actions that edit are greyed. Edits another module would make on the writer's behalf in this pane (dictation) are refused.
- **Read-only belongs to the pane, not the document.** The same document in another pane stays editable, and edits made there, or by modules working on the document in the background (word-moving), show up in the viewer at once.
- **Reading still works.** The caret can be placed, text selected and copied, scrolling works, links and read-only widgets respond. The document looks the same as when editable, with its marks and other modules' decorations.
- **Undo.** Nothing in the viewer to undo; undo in an editable pane of the same document works as usual.
- **Module off.** The pane is editable again, with the caret and scroll position kept. Nothing is remembered. Placing it where the document is already read-only is harmless.
