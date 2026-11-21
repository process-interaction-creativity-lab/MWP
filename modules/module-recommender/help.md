# module-recommender: help

You use a modular word processor but don't know which modules to ask for. module-recommender quietly notes how you edit, then on request reads your text and those notes and suggests a few modules you might want.

## What it gives you

- **Suggest modules** (toolbar button with a light bulb, and palette action **Suggest modules from how I write**): reads the text of the pane you were last in, together with a summary of your habits, and opens a popover under the button. Nothing is sent until you press it.
- **A suggestion** (in the popover): a title, the kind of module it would be, the evidence (a phrase from your text or a number from your habits), a short pitch, and a **Copy brief** button that copies a build brief to the clipboard. You get three to five.
- **The footer** (bottom of the popover): one line of totals: edits, active minutes, characters cut and written, paragraphs revisited, undos. It says nothing is recorded yet if that is true.
- **Forget recorded activity** (button in the footer): clears everything it has recorded.

## Walkthrough

1. Turn on module-recommender and open the popover once by pressing the light bulb. It says nothing is recorded yet.
2. Write a paragraph, cut a long phrase in one go, replace a phrase, bold a word and undo once.
3. Open the popover again and read the footer: your edits, minutes, characters written and cut, and the undo are there.
4. Go back and forth between two paragraphs. Paragraphs you return to three or more times show up as "revisited".
5. Press the light bulb to ask for suggestions. The button shows a spinner while it works and cannot be pressed twice.
6. Read the suggestions and check the evidence against your text and footer. Press **Copy brief** on one you like.
7. Press **Forget recorded activity** if you want to start the notes over.

## How the pieces fit

A finished text hides how it was written; a poem typed straight through and one rewritten eleven times look the same. So suggestions rest on your text and on the record of your editing habits. The record is yours, not the document's: it is not saved in the file, and covers all your documents and sessions. Only your own edits count, not another module's, and moving the caret records nothing. Paragraph revisits last only for the session. Nothing is written to your document.

## Tips

- Needs AI: set a key and model in Settings, in the project tab's menu. Without it the button tells you what to do, and recording and the footer carry on.
- Long documents are sent as their beginning and end, about 6000 characters in all. Notes and other asides are not sent.
- While the module is off nothing is recorded, and the earlier record is kept.
- If the AI call fails or the reply is unusable, a short message appears in the popover; try again.
