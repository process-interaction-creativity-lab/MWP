# heavy-words: help

You are writing, and the page has a little mischief in it. One word in your first paragraph turns red and slowly sinks down the page, line by line, wedging itself between other words, until you catch it.

## What it gives you

- **Heavy** (toolbar toggle, also labelled "Heavy words"; palette action **Toggle heavy words**): turns the behaviour on or off for the pane. It is on by default and remembered across reloads.
- **The heavy word** (the text itself): picked at random from the first block of text. It is red and bold, and each time it moves it visibly drops into place.
- **Catching it** (click on the word): stops it where it is, without moving your caret. It becomes ordinary text again.

## Walkthrough

1. Turn the module on and write a first paragraph with a few sentences. About a second after you start using the pane, a word turns red.
2. Watch it. About once a second it moves to the spot on the next line below it, between two whole words, with the spaces tidied so no double space is left behind.
3. Click the red word to catch it. It stays where it landed and is no longer red.
4. Wait about five seconds. A new word is picked and starts to sink.
5. Type something in the text. Your edit drops the current word where it is as plain text, and after the same pause a new word is picked.
6. Press Cmd-Z. Only your typing is undone, never the word's travel.
7. Click **Heavy** in the toolbar to switch it off: the red goes and the cycle ends. Words that already moved stay where they are.

## How the pieces fit

The word falls, you catch it or it lands, it rests, and then a new word is chosen. Your own edits, or edits from another pane, always end the current fall. With two panes on one document only the one you last focused has a falling word. The moves are real changes to the text, so they are saved with the file, but they never show in undo.

## Tips

- Words shorter than two characters are never picked, and words in notes beside the text are ignored. With nothing to pick, it tries again later.
- The word rests about five seconds after being caught, after reaching the bottom, or after it cannot go on.
- If your system asks for reduced motion, the word moves without the drop animation.
- Turning the module off or closing the pane leaves no red behind.
