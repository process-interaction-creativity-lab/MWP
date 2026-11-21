# haiku-sampler: description

Finds a 5-7-5 haiku made only of your own words, in the order you wrote them, and shows it in a small card. Copy it, ask for another, or close it. It starts from the paragraph with your caret and never changes your document.

**Kind:** extension. It adds a command, a button and a card to an ordinary pane, and only reads the document.

For a writer who wants a playful nudge: "what haiku is hiding in what I already wrote?" A toy for finding found poetry.

- **Asking.** A Haiku button in the toolbar and a palette command, working on the pane the writer was last in. Unavailable when no pane showing a document is focused.
- **Where it looks.** If the writer has a selection, only the selected text. Otherwise the text from the block holding the caret to the end of the document, whatever kind of block the caret is in (a heading samples from the heading onward). Text in asides is ignored and empty blocks are skipped.
- **Taking little text.** It uses as little as it needs: the first paragraph alone, then two, and so on, stopping at the first stretch that holds at least two five-syllable phrases and one seven-syllable phrase.
- **Phrases.** A phrase is a run of consecutive words whose syllables total exactly five (or seven), found left to right without reusing words. Words over seven syllables are skipped; a word that fits no phrase is passed over.
- **The haiku.** Lines one and three are two different five-syllable phrases chosen at random; line two is a random seven-syllable phrase. Each request gives a different haiku when the text allows it. Syllables are counted by a plain heuristic that may be wrong by a syllable on odd words; every word counts at least one, very short words exactly one.
- **Cleanup.** The first line starts with a capital. Trailing punctuation (commas, full stops, dashes, colons, semicolons, question and exclamation marks) is removed from the end of each line; punctuation inside a line stays.
- **The card.** Three lines, centred, in a readable serif face, with Copy, Again and Close. Copy puts the three lines on the clipboard separated by newlines. Again makes another haiku from the same starting point as the first, in the same pane, even while the card holds focus. Close, Esc and a click outside all close it the same way, and the writer is back where they were.
- **Too little text.** With no text the card says nothing was found to sample; with too little it says so and suggests a longer paragraph. Neither is an error.
- **Read-only.** The document is never changed, so undo has nothing to do. Nothing is remembered. A second pane works the same, using its own text.
- **Turning the module off** removes the button, the command and any open card.
