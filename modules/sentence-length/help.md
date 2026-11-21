# sentence-length: help

You are reading over a draft and sense that the rhythm is off: too many sentences of the same length, one that drags, or a run of short ones. sentence-length colours every sentence by how long it is, so you can see the rhythm at a glance.

## What it gives you

- **Sentence tints** (the text itself): every sentence in body text gets a soft background colour by its word count, from red for the shortest sentence in the document, through yellow, green, cyan, blue and violet, to magenta for the longest. Sentences of the same length share a colour. If all sentences are equally long, all are red.
- **Sentence legend** (toolbar): a small strip such as "Sentences 23 · 7 18 41 words". It gives the number of sentences, then three coloured swatches with word counts: the shortest, the median and the longest sentence. With no sentences it reads "Sentences 0".

## Walkthrough

1. Turn the module on and open a document with a few paragraphs of prose. Every sentence is now tinted.
2. Look at the colours. A strip of similar colours means similar lengths; a sudden magenta stands out as the longest sentence in the document.
3. Find the legend in the toolbar. The first swatch is the shortest sentence, the middle one the median, the last the longest. Match the swatch colours to the text to see what each one means.
4. Pick a magenta sentence and split it in two by typing a full stop and a capital letter. The tints and the legend update as you type, and your caret does not move.
5. Try writing a run of short sentences of the same length, such as "I sat. I sang. I left." and watch them take one colour.
6. If you open a second pane on the same document, each pane shows its own legend; the toolbar shows the one for the pane you last used.

## How the pieces fit

The tints show the rhythm sentence by sentence, and the legend gives the numbers behind the colours. The colours are measured against the whole document, even in a pane that shows only part of it, so the same colour always means the same length. Nothing is added to your text and nothing is saved with the file.

## Tips

- Headings, code blocks and empty paragraphs are not tinted. A word is anything between spaces.
- The tint never changes the text, and Cmd-Z only undoes your own edits.
- Turning the module off removes the tints and the legend.
