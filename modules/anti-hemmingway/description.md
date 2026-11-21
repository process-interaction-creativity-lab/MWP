# anti-hemmingway: description

Greys out every word except adjectives and adverbs, so your modifiers stand out against a faded page. It shows how much of a draft is description. Your text is not changed, and the colouring updates as you type. Word types are guessed one word at a time, so expect some mistakes.

For a writer, or an editor, who wants to see how much of a draft is modifiers. It is the opposite of the Hemingway ideal, hence the name.

**Kind:** extension. It only recolours the text of an ordinary editing pane; it has no controls.

- **What is grey.** While the module is on, every word that is not an adjective or adverb is grey, along with the spaces and punctuation between words. Adjectives and adverbs keep the normal text colour, with no other emphasis. This applies to all text, in paragraphs, headings, lists, quotes and any other text block, but not to code blocks or horizontal rules, which keep their normal colour. Notes and alternatives that other modules keep inside the text are left alone, as if not there.
- **How words are judged.** One word at a time, by a part-of-speech guess on the word alone, with no sentence context, in English only. Mistakes are expected, and a word that could be either (such as "light") is whatever the guess says. Case and leading or trailing punctuation are ignored. Words under two letters, and the bare "ly", are grey. Numbers are grey.
- **What counts as a word.** A run of letters, digits and underscore; a contraction ("don't") or hyphenated word ("well-known") is one word. Accented and non-Latin letters are never split mid-word; text the guess can't judge is grey.
- **Live.** Colouring follows every edit: a newly typed word is greyed or kept as soon as it is finished, and words after an edit stay correctly coloured (nothing shifts by a letter after a line break or footnote). It stays responsive on long documents.
- **Only a look.** The document, its marks, selection and undo are never touched, and copied text carries no grey.
- **Several panes.** Every pane the module is placed on looks the same, for the whole document.
- **Module off.** Normal colour returns everywhere.
- **Data.** None; nothing is remembered.
