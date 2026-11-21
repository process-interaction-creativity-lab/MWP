# QA: karaoke-reader

About five minutes. Needs speech output and sound on. Have a document of three or four paragraphs.

1. Press Read. Confirm the whole document is read from the top, exactly one word is highlighted at a time following the voice, there is an audible break between paragraphs, and the last word of a paragraph is not merged with the first of the next.
2. Press Stop while reading. Confirm speech stops and the highlight disappears. Press Read again, let it reach the end, and confirm the highlight clears by itself and the button goes back to Read.
3. Press Read and, while it speaks the second paragraph, add a few words to the first paragraph. Confirm the highlight still sits on the word being spoken.
4. Press Read, then delete the word currently being spoken (or the sentence ahead). Confirm nothing breaks, the highlight never lands on an unrelated word, and speech keeps going.
5. Press Read on an empty document: nothing happens, no error. After a reading, Cmd-Z undoes only your own last edit.
6. Open a second pane on a different document and start reading in the first. Confirm focusing the second pane does not stop it, and the highlight stays in the first pane. Close the reading pane and confirm speech stops.
7. Start reading, turn the module off, and confirm speech and highlight stop; turn it on and confirm Read works again. If you have an inline note, confirm it is not read or highlighted as body text.
