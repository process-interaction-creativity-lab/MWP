# QA: module-recommender

About five minutes. Needs AI turned on with a key in the host settings (step 6 also needs it off). Start with a document of a few paragraphs, ideally a poem or other recognisable form.

1. Open a document and the module's toolbar button. Confirm the popover, opened before any editing, says nothing has been recorded yet rather than showing zeros or an error.
2. Type a paragraph, delete a long phrase (30+ characters) in one go, replace a phrase with another, bold a word, and undo once. Confirm the footer shows edits, active minutes, characters written and cut, and one undo, and that the undo did not add to the characters cut.
3. Move the caret and select text without editing; confirm the footer does not change. Open the same document in a second pane and type one word; confirm the edit count goes up by one, not two.
4. Edit paragraph A, then B, then return to A, three visits to A in all. Confirm "revisited" reflects A, and that typing one paragraph out in one burst counts as one visit.
5. Press the suggestions button. Confirm it shows it is working and can't be pressed again, then shows three to five cards, each with a title, kind, evidence quoting your text or a number from the footer, a pitch, and a working "Copy brief". Confirm none is a module already in the project.
6. Turn AI off and press the button: a plain message says what is missing and nothing is sent. Turn it on, go offline and press again: a short error shows and the button works again afterwards.
7. Use "Forget recorded activity" and confirm the footer says nothing is recorded. Reload, make one edit, and confirm the footer shows only that edit.
8. Turn the module off, edit, and turn it on: the edit while off is not recorded and the earlier record is still there. Have another module or an agent edit the document and confirm the footer does not count it.
