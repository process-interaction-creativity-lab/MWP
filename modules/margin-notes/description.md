# margin-notes: description

Select some text and add a note, and it appears in the page margin beside that line, like pencilled marginalia. Notes are editable in place, saved with the document, and never change your words.

**Kind:** extension. It adds notes and a margin to ordinary panes, which keep showing their document as usual.

For a writer, editor or reviewer who wants to comment on their own text without touching it. Notes read like pencilled marginalia: small, in a handwriting face, in the margin and not over the prose.

- **Adding.** With text selected (across paragraphs too, but not whitespace only) an "add note" control appears near the selection; it does not appear for a caret alone. Using it highlights the span and opens an empty note in the margin with the caret in it, ready to type.
- **The note.** A small editable card in the right margin, level with the line where its span ends. Cards follow the text on scroll, resize and edits. Two notes on nearby lines never overlap: the lower is nudged down just enough, keeping top-to-bottom order.
- **Editing and deleting.** A note is edited in place. A control on its card (shown on hover) deletes it, and the highlight with it.
- **The highlight.** The span is marked softly in the text. If it is later split by a paragraph break or by deleting from its middle, every remaining piece stays highlighted and the card follows the first piece.
- **Note and highlight together.** Clicking into a note (or adding one) tints its card and its highlight, every piece of it, in the same stronger colour, until the caret leaves the note; moving to another note moves the tint to that one.
- **Notes belong to the document.** They are saved with the file, travel with copies of it, and are the same in every pane showing it. Copying text that carries a note and pasting it gives the pasted copy its own note with the same body, which can then be edited separately.
- **Undo.** Adding a note (highlight plus empty card) is one undo step, as is deleting one. Deleting the text a note is attached to takes the note with it; undo brings text, highlight and body back together. An edit to a note's text is saved when the writer leaves the note, and undone as one step.
- **Show or hide.** A toolbar toggle shows or hides the margin layer for one pane. Hidden means no cards, lines or highlights, and the page at its normal width. Each pane chooses independently, the choice is remembered across reloads, and the default is shown.
- **Room for the margin.** The page widens on its right, keeping the text's width, only in panes where notes are shown. In a pane too narrow for it, the pane scrolls sideways to the notes, and the text stays at the left of the view.
- **Turning the module off.** The notes stay in the file but nothing of them shows (no highlight, no cards), and they come back when it is turned on.
