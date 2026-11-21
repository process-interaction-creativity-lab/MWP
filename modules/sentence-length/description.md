# sentence-length: description

Tints every sentence by its word count on one scale, from red for the shortest to magenta for the longest, so the rhythm of your prose shows at a glance. A small legend in the toolbar explains the colours and gives sentence statistics.

For a writer looking for too many sentences of the same length, one that drags on, or a run of staccato. The tint never changes the text.

**Kind:** extension. It tints text and adds a legend to the toolbar of an ordinary editing pane.

Requirements:

- **Which sentences.** Every sentence in body text is tinted, covering the sentence and its trailing space so neighbours abut. Headings, code blocks and blank or whitespace-only paragraphs get no tint. A sentence's length is its word count (a word is a run of non-whitespace). Text inside another module's inline parts is not counted.
- **One scale for the whole document**, even in a pane showing only part of it. The shortest sentence anywhere is red, the longest magenta, with the lengths between running through yellow, green, cyan, blue and violet; equal lengths share a colour, and if all sentences are equal, all are red. The tint is translucent so text stays readable in light and dark themes.
- **Live.** Tints follow edits as the writer types, without moving the caret. Nothing is added to the document, and undo is unaffected.
- **Legend.** A compact strip in the toolbar, always shown, such as "Sentences 23 · ■ 7  ■ 18  ■ 41 words": the number of sentences, then three coloured swatches (shortest, median, longest) tinted as in the text, each with its word count. The median of an even count is the upper middle value. With no sentences it reads "Sentences 0". It is plain text and swatches and does not make the toolbar taller.
- **Per pane.** The legend describes its own pane's document and updates with its edits. The toolbar shows it for the last focused pane. Two panes on one document each have their own.
- **With sentence-length-spectrum** on the same pane, each keeps its own legend, and where both tint a sentence the tints blend.
- **Module off:** tints and legend go.
