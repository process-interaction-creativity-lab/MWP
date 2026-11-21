# QA: speech-to-text

About five minutes. Needs a microphone and permission to use it, and AI set to an endpoint with transcription. Use a document with two paragraphs, the first ending in a full stop.

1. Turn the module on: a microphone toggle appears in the toolbar, greyed with an explanation on hover if there is no microphone support, AI is off, or there is no pane to type into.
2. Caret at the start of the second paragraph, press the toggle: it shows listening once the microphone is granted. Say a short sentence and pause: the whole sentence appears once, after the pause, capitalised, the caret after it, and focus still in the editor.
3. Dictate after a comma mid-sentence: not capitalised. Dictate after a full stop and a space: capitalised.
4. Select a word and dictate: the selection is replaced. Dictate with the caret in bold text: the text is bold. Near the bottom of a long document, the pane scrolls to show it.
5. Undo once after one utterance: exactly that utterance goes. Redo: it returns.
6. Open a second pane on the same document. Click into it and dictate: text goes there; click back and dictate: it goes to the first pane. Close the pane you last dictated into and speak: nothing happens, no error.
7. Make only noise or stay silent: nothing is inserted. Deny the microphone or unplug it: an error is explained and pressing the toggle retries. Make the endpoint fail (a wrong address): the reason shows and that utterance is dropped. Turn AI off while listening: dictation stops.
8. Turn the module off while listening: the system microphone indicator goes off. Turn it on again: dictation needs starting again.
