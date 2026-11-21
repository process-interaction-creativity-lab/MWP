# QA: unfamiliar-words

About five minutes. Use an empty document in a pane with the module placed.

1. Type "The cat sat on the ottoman, contemplating defenestration." "ottoman", "contemplating" and "defenestration" are highlighted with a dotted underline and a tooltip saying they are not in the familiar list; "the", "cat", "sat" and "on" are not. The comma and full stop are outside the highlight.
2. Add a paragraph: `"Don't!" I 42 well-known`. The quotes and "!" are outside the highlight, "Don't" is one word, "I" is checked, the number is never marked, and "well-known" is not marked. Add "The": not marked.
3. Insert, delete and paste words mid-line: marks update immediately and stay on the right words, including in later paragraphs.
4. Turn the switch off and on, from the toolbar and the palette: marks vanish and return at once, the document is unchanged and undo gets no step.
5. Open the dictionary dialog: it explains itself and shows the list. Remove "cat", add "ottoman", Save: "cat" is marked and "ottoman" is not, immediately. Reopen: the saved list is there. Edit, then Cancel: nothing changed.
6. Save an empty list: every word with a letter is marked, numbers are not. Reopen, Reset to default, Cancel: the empty list is still active. Reset, Save: normal marks return.
7. Open a second pane on the same document: same marks; switching off in one leaves the other marked; a dictionary change updates both.
8. Reload: the saved list is still in force. Turn the module off and on: marks return with the same list.
