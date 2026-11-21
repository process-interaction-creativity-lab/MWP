# karaoke-reader: description

Press Read and your whole document is spoken aloud in your device's voice, with each word highlighted as it is said, so your eye keeps its place. Press the button again to stop. Your text is never changed.

**Kind:** extension. It adds a button and a highlight to an ordinary pane. To read from the caret instead, see read-aloud.

For a writer, or someone listening to a draft, who wants to follow along while the document is read aloud, like a karaoke screen.

- **The button.** A toolbar button, Read, which becomes Stop while reading. It is greyed with no pane focused, and greyed (or says so) when the device has no speech, rather than doing nothing.
- **What is read.** The whole document from the top, in the pane where the writer pressed Read, once, at the normal rate. Nothing happens, and nothing errors, on an empty document. Starting a reading stops any other speech.
- **One highlighted word at a time,** in that pane only, moving forward word by word as it is said. It disappears when reading ends or is stopped.
- **Edits while listening.** The speech is what the document said when reading began. If the writer types before the spoken word, the highlight still lands on the word being spoken, not on whatever now sits at the old place. If that word has been deleted or changed beyond recognition, no highlight is shown for it and speech carries on; editing while listening is never punished by stopping.
- **Paragraph breaks are real breaks:** an audible pause, and the last word of a paragraph is never run together with the first of the next. Words in notes inside the text (footnotes, margin notes, alternatives) are neither read nor highlighted as body text.
- **Stopping.** Stop, the end of the text, closing the pane, and turning the module off each end the speech and clear the highlight, and the button returns to Read. Moving focus or the caret to another pane or document does not stop it.
- **Reading never edits.** No change to the document, no undo entry, no change to the selection or caret: after a reading, Cmd-Z undoes only the writer's own last edit.
- **Remembered.** Nothing.
