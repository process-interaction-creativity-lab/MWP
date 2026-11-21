# QA: document-viewer

About five minutes. A document with several paragraphs, some bold text.

1. Place document-viewer on a pane showing the document. Confirm it looks the same as before (marks, other modules' decorations) and scrolls normally, and the toolbar says "Read-only".
2. Click into the text and try typing, Backspace, Delete, Enter, and Cmd/Ctrl+V. Confirm nothing changes. Try drag and dropping a selection and Cmd/Ctrl+X, and confirm the text stays.
3. Select a sentence and copy it, then paste it into a different, editable document. Confirm the copy worked and the viewer is unchanged.
4. With a word selected, press Cmd/Ctrl+B, and also try Bold from the Cmd+K palette and from the toolbar. Confirm none changes the text, and that Bold is greyed in the palette.
5. If another module makes edits on its own (dictation, or one that rearranges words), use it with the viewer pane focused and confirm the text stays as it was.
6. Open a second pane on the same document without the viewer. Confirm it edits normally and the change appears in the viewer pane at once. Confirm Cmd-Z in the editable pane works.
7. Turn the module off. Confirm the pane is now editable and your scroll position and caret are unchanged. Turn it on again and confirm editing stops. If you place it twice, confirm nothing breaks.
