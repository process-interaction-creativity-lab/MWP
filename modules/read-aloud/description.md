# read-aloud: description

Place the caret, press Cmd-Shift-S (Ctrl-Shift-S elsewhere), and the document is read aloud from there to the end in your device's voice. Pressing any key stops it. You can choose which voice speaks. Useful for catching clumsy rhythm and proofreading by ear.

**Kind:** extension. It adds a hotkey, two palette actions and a toolbar control to an ordinary pane. To follow along with a moving highlight, see karaoke-reader.

For a writer who wants to hear their draft: to catch clumsy rhythm, proofread by ear, or rest their eyes.

- **Starting.** Cmd-Shift-S on macOS and Ctrl-Shift-S elsewhere starts reading; this works on macOS in Chromium and Electron as well. Also "Read aloud from cursor" in the palette and a toolbar button, greyed when there is no pane to read from.
- **From the caret.** Reading begins at the start of the current selection, in the pane the writer is working in, and runs to the end of that document. If the caret is at the very end, or no text follows, nothing starts and nothing errors.
- **Breaks.** Paragraph breaks are spoken as pauses, not as two words glued together. Text in inline notes (footnotes, margin notes, alternatives) is not read as body text.
- **Any key stops it.** Any key press anywhere in the window (editor, toolbar, nowhere in particular) stops playback. A bare modifier press and a held key's auto-repeat do not, and the press that started the reading does not stop it. A Stop button (the toolbar button turns into it) and "Stop reading" in the palette also stop it; Stop is greyed when nothing is speaking.
- **Stops on its own** at the end of the text, when the pane it reads from closes, and when the module is turned off.
- **One reading at a time.** Starting again while reading restarts rather than overlapping.
- **Voice.** A picker lists the device's voices plus "default voice". The choice belongs to the writer, not a pane or document, and is remembered across reloads. If the chosen voice is gone, the default is used.
- **No speech engine.** Where speech is unavailable, the controls say so or grey out rather than doing nothing.
- **Reading never edits.** No change to the document, no undo entry, no change to the selection. Editing while it reads is allowed; the speech is the text as it was when reading started.
