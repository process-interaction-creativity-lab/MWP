# heavy-words: description

A random word in your first paragraph turns red and slowly sinks down the page, one line at a time, wedging itself between other words. Click it to stop it where it is. After a pause another word is chosen. The moves are real edits but stay out of undo.

**Kind:** extension. It adds a timed behaviour and a highlight to an ordinary pane.

For a writer who likes a little mischief in the page, or wants it to feel alive while they think.

- **The word.** Picked at random from the first block of text in the document (paragraph, heading, any block of text; text in asides is never picked). A word is a run of letters or digits; surrounding punctuation is not part of it, inner apostrophes are. Words under two characters are never picked. With no eligible word nothing happens, and it tries again later. The very first word is picked about a second after the pane is first used.
- **How it looks.** The picked word is red and bold, and each time it moves it visibly drops into place. With reduced motion there is no drop animation.
- **Sinking.** About once a second the word moves to the word boundary on the next visual line below it (the spot under it on screen, snapped to the start of the nearest word), ending between two whole words with a space on each side. It is a real edit: the word leaves with one neighbouring space, so no double space is left, and lands lower. It never lands inside another module's block or an aside; if it cannot go on, it stops.
- **Undo.** The moves are the module's own motion, not the writer's: they never appear in undo history. Cmd-Z undoes the writer's typing, not the word's travel.
- **Catching it.** Clicking the heavy word stops it where it is, without moving the caret. It stays in the text as ordinary prose, no longer red.
- **Pauses.** When the word is stopped, or reaches the bottom of the text or a place it cannot go, it rests about five seconds and then a new word is picked.
- **The writer's edits.** Any edit not made by this module, from the writer, another pane on the same document or a collaborator, drops the current word where it is as plain prose, and a new word is picked after the same pause.
- **One pane at a time.** Only the pane the writer last focused animates; focusing another pane starts a fresh cycle there. Two panes on one document never have two words falling.
- **The switch.** An action "Toggle heavy words", with a toolbar button "Heavy words" and a palette entry, per pane, on by default, remembered across reloads. Turning it off ends the cycle and clears the red; words that already moved stay.
- **Turning the module off** or closing the pane stops the animation and leaves no highlight behind.
