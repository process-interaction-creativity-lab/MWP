# QA: read-aloud

About five minutes. Needs speech output and sound on. Have a document with at least three paragraphs.

1. Put the caret in the middle of the second paragraph and press Cmd-Shift-S (Ctrl-Shift-S on Windows or Linux). Confirm speech starts at the caret, not the top, and a pause is audible between paragraphs. Confirm the hotkey works on macOS, not only the button.
2. While it reads, press an ordinary letter key; confirm it stops at once. Start again and press only Shift, or hold a modifier: it keeps going. Start with the hotkey and confirm that press itself does not stop it.
3. Start reading and click Stop, then start from the toolbar button. Open the command palette and confirm "Read aloud from cursor" and "Stop reading" are listed, and Stop is greyed when nothing is speaking.
4. Put the caret at the very end and start: nothing is spoken, nothing breaks. Select a range in the middle and start: reading begins at the start of the selection and goes to the end.
5. Start reading, then press the hotkey again: no overlapping speech. Edit while it reads and confirm the document, caret and undo history are unaffected by the reading.
6. Pick a different voice and start; confirm it is used. Reload and confirm it is still chosen. If you have an inline note, confirm its text is not read as part of the sentence.
7. With two panes open, start reading in one and close that pane: speech stops. Turn the module off while speaking: it stops. Turn it on and confirm the hotkey works.
