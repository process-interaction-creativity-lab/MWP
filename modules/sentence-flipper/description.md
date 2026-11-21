# sentence-flipper: description

Shows every sentence turned around: statements become questions, and questions become statements. It is a view only, so your text is never changed. Switch it on or off to compare, and the sentence you are typing in always shows its original wording.

For a writer who wants to test their prose by seeing each claim as a question and each question as a claim.

**Kind:** extension. It changes how an ordinary pane displays the text, never the text.

Requirements:

- **Flipped display.** Each sentence in a paragraph or heading is shown flipped. A statement becomes a question ("Is it true that ...?") and a question becomes a statement, with correct capital letters and a single closing mark (a statement ending "!" or with no mark gets one "?"). Flips don't lowercase "I" or proper nouns, and keep the sentence grammatical where the rules can. Code blocks, horizontal rules and empty paragraphs are left alone. A flipped heading still looks like a heading.
- **Document untouched.** The text, marks, undo history and saved file are never changed. Copying a flipped sentence copies the original text.
- **The sentence you're in.** The sentence holding the caret or selection shows its original wording, so the writer never types into text that isn't there. Move away and it flips again, with the edit.
- **Follows editing.** Edit a sentence and its flip updates.
- **Toggle.** A toolbar toggle shows whether the flip is on; a palette action does the same. On by default. Off shows the document exactly as written; on again is immediate. The switch is per pane, so two panes on one document each have their own, and it is forgotten on reload.
- **Module off:** the document shows as written, with no leftover or doubled text.
