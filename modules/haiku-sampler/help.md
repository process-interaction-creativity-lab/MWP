# haiku-sampler: help

You have written some prose and wonder what poem is hiding in it. haiku-sampler picks a 5-7-5 haiku out of your own words, in the order you wrote them, and shows it in a small card. It never changes your document.

## What it gives you

- **Haiku** (toolbar button, and palette action **Find a haiku in the text**): opens the card for the pane you were last in. It is greyed out when no pane with a document is focused.
- **The card**: three centred lines in a serif face. The first line starts with a capital, and trailing punctuation is removed from each line.
- **Copy** (card button): puts the three lines on the clipboard, one per line.
- **Again** (card button): makes another haiku from the same starting point.
- **Close** (card button, **Esc**, or a click outside): closes the card and puts you back where you were.

## Walkthrough

1. Write or open a document with at least three paragraphs of ordinary prose.
2. Put the caret in the first paragraph and press **Haiku** in the toolbar, or use the action palette (Cmd-/ or Ctrl-/).
3. Read the card. The words are yours, in your order; syllables are counted by a simple guess, so odd words may be off by one.
4. Press **Again** a few times to get different haiku. The two five-syllable lines are never the same phrase.
5. Press **Copy** and paste somewhere to keep one.
6. Close the card with **Close**, **Esc** or a click outside. Your text and caret are as you left them.
7. Select a single sentence and run it again: only the selection is used.

## How the pieces fit

The haiku starts at the paragraph with your caret and uses as little text as it needs, reading forward to the end of the document, so where you put the caret decides what you can find. A selection narrows it to just that text. Nothing is saved or remembered.

## Tips

- If there is too little text, the card says so and suggests a longer paragraph; with no text it says nothing was found. Neither is an error.
- Text in asides is ignored, and empty paragraphs are skipped.
- Each pane works from its own text.
