# QA: sentence-flipper

About five minutes. Use a document with a heading, a paragraph with a statement and a question, a code block and an empty paragraph.

1. With the module on, the statement reads as a question ("Is it true that ...?") and the question as a statement, in the paragraph and the heading. The heading flip still looks like a heading; the code block and empty paragraph are unchanged.
2. Click into a flipped sentence: it shows its original text, other sentences stay flipped, and typing edits the real text. Move the caret away: it flips again with the edit.
3. Copy a flipped sentence and paste it into a plain place: the original text is pasted. The undo history shows no change from the module.
4. Use the toolbar toggle: off shows the document as written, on flips at once, and the toggle reflects the state. Repeat from the palette.
5. Write a sentence with no end punctuation and one ending "!", and one starting with "I": each flips to a question with a single question mark and no lowercased "I".
6. Open a second pane on the same document and turn it off there: the first pane is still on. Edit a sentence: both update correctly.
7. Turn the module off and on: plain, then flipped again, with no hidden or doubled text.
