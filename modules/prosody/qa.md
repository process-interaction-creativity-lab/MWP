# QA: prosody

About five minutes. A new document; paste in two quatrains of rhymed iambic verse, one line per paragraph, with a blank paragraph between stanzas (for example the opening of Gray's "Elegy": "The curfew tolls the knell of parting day, / The lowing herd wind slowly o'er the lea, ...").

1. With the module on, confirm each line shows a strong or weak mark under each syllable, with foot dividers, and lines are spaced to leave room. Hover a syllable and confirm a plain explanation appears. The default meter should read as iambic pentameter.
2. Put the caret in a line and confirm the report shows whether it fits, how many spots break, and which liberties it used. Move the caret to a blank line and confirm it asks you to place the caret in a line of verse.
3. Change the document meter to iambic tetrameter; confirm violations and the report change for every line. Change the second stanza only, to trochaic; confirm only that stanza changes. Set it back to "use the document default" and confirm it returns. With word-processor placed, turn the stanza's first line into a heading (Mod-Alt-1) and back (Mod-Alt-0) and confirm its meter is still the one chosen.
4. Confirm the rhyme letters (ABAB, say) appear beside the first stanza's lines and each end word is underlined. Hover an end word and confirm it names its slot and partners. Change the last word of a second-stanza line to one that does not rhyme; confirm that line turns red. Make the first stanza rhyme-free; confirm no scheme is enforced and the report says none was detected.
5. Type a line with an invented word, and one with "every" or "heaven". Confirm the invented word is never flagged and the elision is credited in the report. Type a far too long line and confirm it says it cannot scan rather than showing marks.
6. Undo the last meter change, then redo it; confirm the meter and marks follow. Reload and confirm the chosen meters are still set.
7. Open a second pane on the same document. Change the meter in one pane and confirm the other updates; focus each and confirm the report follows. Paste a paragraph that has line breaks inside it (the editor has no Shift-Enter yet) and confirm each line of it is scanned on its own.
8. Turn the module off and confirm all marks, letters and the report vanish and the text is unchanged. Turn it on and confirm your meter choices are back.
