# speech-to-text: help

You want to dictate instead of typing. Press the microphone, speak, and each time you pause, what you said is typed in at your caret as ordinary text you can edit and undo.

## What it gives you

- **Start dictation** / **Stop dictation** (microphone button in the toolbar, **Toggle dictation** in the palette): starts and stops listening. Its look shows the state: ready, waiting for microphone permission, listening, or an error with the reason beside it.
- **The text itself**: each pause sends one utterance, and the whole phrase appears at once, with no preview of words still being spoken.
- **Capital letters** (automatic): the first letter is capitalised at the start of a paragraph and after a full stop, question mark or exclamation mark; after a comma it stays as spoken.

## Walkthrough

1. Turn the module on. A microphone button appears in the toolbar; hover it if it is greyed out to see why.
2. Click into your document where you want the words and press the microphone. Allow the microphone if the browser asks; it shows listening once it is granted.
3. Say a short sentence and pause. The sentence appears once at your caret, capitalised if it starts a sentence, and you stay in the editor.
4. Select a word and dictate: the selection is replaced. Dictate with the caret in bold text and the new text is bold.
5. Press **Cmd-Z**: exactly the last utterance goes. **Cmd-Shift-Z** brings it back.
6. With two panes, click into the one you want and keep talking; words go to the pane you last used. Press the button again to stop.

## How the pieces fit

The button listens; each pause's audio is sent to your AI endpoint's transcription service, and the returned text is put in as your own edit. Settings has the transcription model it asks for: whisper-1 unless you name another, as some providers need. Only one dictation runs at a time, however many panes are open. Nothing is remembered between sessions: after a reload nothing is listening.

## Tips

- Needs AI: set a key and model in Settings, in the project tab's menu, with an endpoint that offers transcription. Without AI the button is greyed; turning AI off while listening stops dictation. Point the endpoint at a local server to keep audio on your machine.
- Needs a microphone and your permission to use it.
- Silence and background noise insert nothing.
- After an error, such as a denied microphone or a failed call, press the button again to retry; a failed call drops only that phrase.
