# sentence-flipper: help

You are polishing a draft and want to test whether each claim holds up. This module shows every sentence turned around, so statements read as questions and questions as statements, while your real text stays exactly as you wrote it.

## What it gives you

- **Flip** (toolbar toggle; palette action **Toggle sentence flip**): turns the flipped view on or off for this pane. The toggle looks pressed while the flip is on.
- **Flipped sentences** (the text itself): a statement shows as "Is it true that ...?" and a question shows as a statement. Headings are flipped too and still look like headings. Code blocks, rules and empty paragraphs are left alone.
- **The sentence you are in** (the text itself): the sentence holding your caret or selection shows its original wording, so you never type into words that aren't there.

## Walkthrough

1. Turn the module on, then write a heading and a paragraph with a statement and a question, for example "The river floods every spring. Who will move the town?"
2. Look at the paragraph: the statement now reads as a question and the question as a statement. The heading is flipped as well.
3. Click into a flipped sentence. It shows its original wording and the others stay flipped. Type to edit it.
4. Click elsewhere. The edited sentence flips again, with your change.
5. Try a sentence with no end mark, one ending in "!", and one starting with "I". Each becomes a question with a single "?" and keeps its capital "I".
6. Click **Flip** in the toolbar to switch to the plain document, and again to flip once more. The palette action does the same.
7. Select a flipped sentence, copy it and paste it somewhere plain: you get the original text.

## How the pieces fit

The flip is only a view laid over your text. The words, the undo history and the saved file never change, so you can switch it on to review and off to read normally. The sentence you are editing steps out of the way so you always edit what is really there. The switch is per pane, so two panes on one document can each be on or off, and it is forgotten when you reload.

## Tips

- It is on by default whenever the module is on.
- Undo only ever undoes your own typing, never a flip.
- Turn the module off and the document shows as written, with nothing left over.
