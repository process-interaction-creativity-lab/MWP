# unfamiliar-words: description

Marks every word that is not on a list of familiar, everyday words, so jargon and complicated vocabulary stand out. The list is the thousand most common words and you can edit it. Turn the marking on or off with a button.

For a writer who wants plain language. The default list is XKCD's "Simple Writer" thousand words with their common inflections, bundled so it works offline.

**Kind:** extension. It marks text in an ordinary editing pane and adds toolbar controls and a dialog; the document is untouched.

Requirements:

- **Marks.** Every word not on the list gets a soft highlight with a dotted underline and a tooltip saying it is not in the familiar-words list. Familiar words are unmarked. Marking covers every block of text and updates as the writer types, deletes or pastes, staying on the right words past footnotes and line breaks. Other modules' inline notes are not read as body text.
- **What a word is.** Matching ignores case. Words are separated by whitespace; leading and trailing punctuation stays outside the mark and inner punctuation stays in, so "Don't!" is the word "Don't" and "(ottoman)," marks only "ottoman". Single-letter words such as "I" and "a" are checked. A token with no letter, such as a number, is never marked. A hyphenated compound is checked part by part and marked as a whole only if some part is unfamiliar ("well-known" is not marked if both parts are listed).
- **Switch.** A toolbar button and a palette action turn the marking on and off per pane; on by default. Off shows no marks at all. Switching changes only how the pane looks: no edit, no undo step.
- **Dictionary.** A "Dictionary" control opens a dialog that explains what the list does and shows the current list, one word per line (commas also separate, so a pasted comma list works). Save replaces the list (lowercased, blanks and duplicates dropped) and updates the marks in every pane at once. Cancel closes without saving. "Reset to default" puts the bundled list in the text box without saving; only Save applies it. Reopening shows the last saved list, not a half-edited draft. Saving replaces the default; it doesn't add to it.
- **An empty saved list** is a real list: every word with a letter is marked. It does not fall back to the default, and it differs from the switch being off.
- **Remembered.** The edited list is the writer's own, not the document's or the pane's: it follows them across documents and survives reloads. Until edited, the bundled list is used.
- **Second pane** on the same document: both show the same marks, the switch is per pane, and a dictionary change updates both.
- **With another highlighter** on the same word, the later-placed module's look wins.
- **Module off:** all marks go; the list is kept.
