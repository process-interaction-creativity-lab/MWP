# sentence-spacing: help

You are tightening a paragraph and want to see its pieces one at a time. sentence-spacing spreads out the sentences, or the words, of the paragraph you are in, without adding anything to your text.

## What it gives you

- **Sentences** (toolbar, shown as on when chosen; palette action **Space sentences**): a wide gap after each sentence in the paragraph with your caret, except the last. This is the default.
- **Words** (toolbar, shown as on when chosen; palette action **Space words**): a wide gap between every word in the paragraph with your caret.
- **Spacing that follows you** (the text itself): click into another paragraph and the spacing moves there; select across several paragraphs and each one is spread. Other paragraphs stay tight.

## Walkthrough

1. Write three paragraphs of several sentences each, with a heading above them, and put one paragraph in a list.
2. Turn on sentence-spacing. Click into the first paragraph: its sentences spread apart, and the last one has no extra gap.
3. Click into the second paragraph. The spacing follows your caret.
4. Select from the middle of the first paragraph into the second. Both are spread; the third stays tight.
5. In the toolbar, press **Words**. Every word in your paragraph spreads out. Press **Sentences** to go back.
6. Click into the heading (never spaced), a list paragraph (spaced) and a paragraph with a single sentence (no gap in sentences mode).
7. Type in a spaced paragraph, then undo with **Cmd-Z**; only your typing is undone.

## How the pieces fit

The two choices are two zoom levels on the same idea: look at your sentences, or look at your words. One is always on, and turning the module off is how you stop. The gaps are only how the paragraph is drawn: copying and pasting gives plain text, and the saved file is unchanged. Your choice is remembered for each pane and survives a reload, so two panes on one document can each use their own.

## Tips

- A paragraph with only one sentence shows no gap in sentences mode.
- Headings and code blocks are never spaced.
- Sentence mode keeps working in paragraphs with footnotes or other inline items.
