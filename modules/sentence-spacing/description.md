# sentence-spacing: description

Click into a paragraph, or select across a few, and its sentences spread apart with wide gaps so you can look at them one at a time. You can spread words instead. Other paragraphs stay tight, and no spaces are added to your text.

For a writer who wants to look at the pieces of the paragraph they are working on, one at a time.

**Kind:** extension. It changes how an ordinary pane displays the paragraphs near the caret, and adds two toolbar actions.

Requirements:

- **Which paragraphs.** Only paragraphs the selection touches are spaced: a caret spaces its paragraph, a selection across several spaces each, and the spacing follows the caret as it moves. Paragraphs inside lists and quotes count; headings and code blocks are never spaced.
- **Two granularities,** chosen from the toolbar and the palette, with the chosen one shown as on: **sentences** (a wide gap after each sentence except the last; a paragraph with fewer than two sentences shows none) and **words** (a wide gap between every word). Default is sentences. One of the two is always on; turning the module off is how to stop.
- **Sentence mode works everywhere,** including paragraphs holding footnotes or other modules' inline parts, with the gap after the right sentence; it never falls back to word spacing.
- **Display only.** No characters are added: the text, undo, copy and paste and the saved file are as they were.
- **Feel.** Spacing appears and disappears smoothly, and typing stays responsive in a long document.
- **Remembered.** The mode is per pane and survives reload. Two panes on one document each keep their own mode and their own caret's spacing.
- **Module off:** the spacing goes.
