# sentence-length-spectrum: help

You are revising and want to see which sentences are unusually short or long for this piece, and in which direction. This module tints each sentence by how far its length is from your typical one.

## What it gives you

- **Tints** (the text itself): sentences of typical length stay clear, shorter ones shade blue and longer ones red. The further from typical, the stronger the colour. Headings, code blocks and blank paragraphs are not tinted.
- **Spectrum** (toolbar toggle; palette action **Toggle sentence length spectrum legend**): opens and closes the legend.
- **Legend** (a small panel at the top right of the pane): a bar fading from blue through clear to red, the shortest, median and longest word counts, the labels shorter, typical and longer, and the number of sentences with the median.
- **Close legend** (the X button in the legend's header): closes the legend; **Spectrum** reopens it.

## Walkthrough

1. Turn the module on and write a few paragraphs of sentences of about eight words, with a few very short ones and a few long ones.
2. Look at the colours: short sentences are blue, long ones red, typical ones plain.
3. Click **Spectrum** in the toolbar to open the legend. Match its bar and labels to what you see in the text.
4. Add one sentence of about sixty words. It turns strongly red, but the others do not turn blue.
5. Delete it and watch the colours settle back. Keep typing: tints and the legend numbers update as you go.
6. Make every sentence the same length: nothing is tinted.
7. Close the legend with its X or with **Spectrum**. If you reload, it comes back as you left it.

## How the pieces fit

The tints show the direction and size of each difference, and the legend gives the numbers behind them. Each side is scaled by its own range, so the shortest sentence is fully blue and the longest fully red, however lopsided the piece. The scale covers the whole document, even in a pane showing only part of it. Nothing is written into your text, so undo only changes your typing.

## Tips

- A sentence's length is its word count.
- The legend belongs to its pane: a second pane on another document has its own numbers, and open or closed is remembered per pane.
- It works beside sentence-length on the same pane; each keeps its own control and legend, and where both tint a sentence the colours blend.
- With no sentences, the legend shows zeros.
