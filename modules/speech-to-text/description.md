# speech-to-text: description

Press the microphone button and speak. Each time you pause, what you said is typed in at your caret as ordinary text you can edit and undo. Each pause's audio goes to your AI endpoint's transcription service, so it needs AI; point the endpoint at a local server to keep audio on your machine.

For a writer who wants to dictate instead of typing.

**Kind:** extension. It adds a toolbar control and a source of text to an ordinary editing pane.

Requirements:

- **The toggle.** A microphone toggle in the toolbar starts and stops dictation and shows its state: ready, waiting (microphone permission is pending), listening, or an error with the reason. After an error, pressing it again retries. It is greyed out, with an explanation, when there is no microphone support, AI is off, or there is no pane to dictate into (none used yet). Turning AI off while listening stops dictation.
- **Through the AI endpoint.** Each utterance is sent as audio to the writer's endpoint (`/audio/transcriptions`, OpenAI-compatible), with the transcription model chosen in Settings, and nothing else is sent. A failed call shows its reason on the toggle and drops that utterance; dictation goes on.
- **Text arrives once per pause,** whole, with no preview of words still being spoken. It is trimmed; silence and noise insert nothing.
- **Where it goes.** At the caret of the pane the writer last used, at the moment it arrives (even if focus is now on the toolbar or palette), replacing the selection if there is one, with the caret left after it. Focus stays in the editor, and the pane scrolls to show the text if it landed off-screen. It is plain text, taking on the writer's active formatting (bold, italic) as typed text would; typing shortcuts such as smart quotes don't apply to it.
- **Capitalisation.** At the start of a paragraph, or after sentence-ending punctuation (full stop, question mark or exclamation mark, optionally followed by a closing quote or bracket) and any spaces, the first letter is capitalised. Elsewhere, for instance after a comma or mid-word, the text is left as spoken.
- **Undo.** Each utterance is one undo step of its own, an ordinary edit by the writer in that pane.
- **One microphone.** Only one session exists at a time however many panes are open. Turning the module off, or closing the app, stops it and releases the microphone, with the system's microphone indicator going off; dictation must be started again afterwards.
- **Closed pane.** An utterance arriving after the pane it was meant for has closed is dropped without an error.
- Dictation state is not remembered: nothing is listening after a reload.
