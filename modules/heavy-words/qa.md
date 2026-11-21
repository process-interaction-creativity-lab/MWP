# QA: heavy-words

About five minutes. Have a document with a first paragraph of at least five or six lines, and a few more paragraphs below.

1. Open the document, click in the text and wait a couple of seconds. Confirm one word in the first paragraph turns red and bold, and about once a second it drops to the next line, ending between two whole words with a space on each side and no double spaces left behind.
2. Click the red word while it is moving. Confirm it stops, turns back to normal text, and the caret did not jump into it. Confirm that after about five seconds a different word starts.
3. Let a word fall to the end of the text. Confirm it stops without an error and a new word is chosen after the pause.
4. While a word is falling, type a letter somewhere. Confirm the red word stays where it is as plain text, nothing falls for about five seconds, then a new word starts. Press Cmd-Z a few times and confirm it undoes your typing, not the words' travel.
5. Open a second pane on the same document. Confirm only the focused pane shows a falling word, focusing the other moves the animation there, and an edit in one pane stops the word in the other.
6. Use the Heavy words toolbar toggle (or the palette entry) to turn the effect off. Confirm the red disappears, nothing moves, and moved words stay. Turn it on and confirm a word starts. Reload and confirm the setting held.
7. Switch the module off and confirm no red highlight is left. Try a first paragraph with only one-letter words, or an empty document: nothing happens and nothing errors.
