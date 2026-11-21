# prosody: help

You are writing a poem in a set form. You say which meter you are aiming for, and prosody marks each line's stressed and unstressed syllables, flags where the meter breaks, and checks your rhyme scheme.

## What it gives you

- **Poem meter** (toolbar picker): the meter for the whole poem. The choices are iambic tetrameter, pentameter and hexameter; trochaic tetrameter, plain and catalectic; anapestic trimeter and tetrameter; and dactylic hexameter. The default is iambic pentameter.
- **Stress marks** (under each line): a strong or weak mark for each syllable, with a divider at each foot. Syllables that break the meter are marked and coloured. Hover one for a plain explanation.
- **Rhyme letters** (left margin): the scheme letter of each line (ABAB and so on), with each line's end word underlined. Hover an end word to see which words it should rhyme with. A line that fails to rhyme with its stanza turns red.
- **Prosody** (side tab): shows the line the caret is in: whether it fits, how many spots break the meter, and which liberties it used. It also holds the **Stanza meter** picker.

## Walkthrough

1. Turn prosody on. Paste two rhymed stanzas, one line per paragraph, with a blank paragraph between them.
2. Look under the lines: each syllable has a mark and a foot divider. Hover a marked syllable.
3. Open the **Prosody** side tab and put the caret in a line to see whether it fits. Move to a blank line and it asks you to place the caret in a line of verse.
4. Change **Poem meter** to iambic tetrameter and watch every line's marks and report change.
5. Put the caret in the second stanza and set **Stanza meter** to a different meter. Choose "Use document default" to go back.
6. Check the rhyme letters in the margin. Change a line's last word to one that does not rhyme, and the line turns red.
7. Type a line with an invented word, and a very long line, and see how each is handled.

## How the pieces fit

The poem meter is your statement of the form; a stanza can override it. Scansion reads each line for its best fit, allowing licensed liberties such as eliding "every" or "heaven" to fewer syllables, inverting the first foot or adding a feminine ending, and the report names the liberties it used. One-syllable words and words the dictionary lacks bend to the meter and are never flagged. Your meter choices are saved with the file and shared by every pane.

## Tips

- A stanza is a run of non-blank lines ended by a blank paragraph.
- If no reading fits, the line is reported as unscannable instead of showing invented marks.
- The rhyme scheme comes from the first stanza. If nothing there rhymes perfectly, none is enforced. Slant rhymes are not accepted.
- It works offline with no AI. Turn it off and the marks and report go, while your meter choices are kept.
