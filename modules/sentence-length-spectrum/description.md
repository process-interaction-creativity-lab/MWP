# sentence-length-spectrum: description

Tints each sentence by how far its length is from your document's typical length. Typical sentences stay uncoloured, short ones shade blue and long ones red. A legend you can open or close explains the scale. Your text is never changed.

For a writer who wants to see which sentences stand out from the usual length, and in which direction. Where sentence-length answers "which is longest", this answers "how far from typical, and which way".

**Kind:** extension. It tints text and adds a toolbar control with a legend to an ordinary editing pane.

Requirements:

- **Which sentences.** Every sentence in body text is tinted, covering the sentence and its trailing space so neighbours abut. Headings, code blocks and blank paragraphs get no tint. A sentence's length is its word count (a word is a run of non-whitespace); text inside other modules' inline parts is not counted.
- **Centred on the median.** A sentence at the median (upper middle for an even count) is clear. Shorter ones shade blue, longer ones red, never a mix.
- **Each side by its own span.** The shortest sentence is fully blue and the longest fully red, however lopsided the document: one 60-word sentence must not turn the rest blue. A side with no sentences beyond the median has nothing to shade. If all sentences are equal, nothing is tinted. Strength rises evenly from clear at the median to its maximum at either end, and reads correctly on light and dark themes.
- **One scale for the whole document**, even in a pane showing only part of it.
- **Live.** Tints follow edits as the writer types, without moving the caret. Nothing is added to the document, and undo is unaffected.
- **Legend.** A toolbar control opens and closes it, and it can close itself. It shows a bar fading blue to clear to red, the shortest, median and longest word counts, the labels "shorter", "typical" and "longer", and the sentence total with the median. With no sentences everything reads zero. It stays open while the writer types, and has a palette action like sentence-length's.
- **Per pane.** The legend describes its own pane's document and updates with its edits. Open or closed is remembered per pane across reloads.
- **With sentence-length** on the same pane, each keeps its own control and legend with no clash in look; the popovers may overlap, and where both tint a sentence the tints blend.
- **Module off:** tints and legend go.
