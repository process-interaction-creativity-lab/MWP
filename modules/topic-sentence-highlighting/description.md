# topic-sentence-highlighting: description

Highlights the first sentence of every paragraph and blurs the rest, so your document reads as a skeleton of topic sentences and you can check whether each paragraph states its point up front. Hover over a paragraph to read it in full.

For a writer or editor checking whether each paragraph announces its point in its first sentence. It is a reading lens and never changes the document.

**Kind:** extension. It only restyles the text of an ordinary editing pane.

Requirements:

- **Paragraphs.** In every body paragraph the first sentence (with its trailing space) has a soft yellow highlight and the rest of the paragraph is blurred. A one-sentence paragraph is highlighted with nothing blurred; an empty paragraph shows nothing.
- **Sentences** end at a run of full stops, question marks or exclamation marks followed by whitespace or the end of the paragraph. The rule is crude on purpose: "Dr. Smith" and quoted dialogue may split early, and that is accepted.
- **Other blocks.** Headings, block quotes, code blocks and lists are blurred as whole units, not by sentence. A paragraph inside a quote or list is part of its block's blur and gets no topic highlight of its own.
- **Reading.** Hovering a paragraph or block clears its blur smoothly and restores it when the pointer leaves; the highlight stays, and other paragraphs stay blurred. The paragraph or block holding the caret or selection is also clear, so a writer on keyboard or touch can read what they are working on.
- **Live.** Typing, deleting, pasting and undo update highlight and blur at once, with no drift; typing in a blurred paragraph works. Large documents stay responsive.
- **Display only.** Nothing is saved, exported, copied, searched or put in undo; the text is identical with the module on and off.
- **Second pane** on the same document: both show the effect, and a hover in one affects only that pane.
- **Module off:** all highlight and blur go at once; on again restores them.
