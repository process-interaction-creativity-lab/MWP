# QA: anti-hemmingway

About five minutes. Have a document with a heading and two paragraphs, for example "The very old dog quickly ran across the wide field." plus a second paragraph with a contraction ("Don't stop" and a bulleted list) and a few numbers.

1. Place the module on a pane showing the document. Confirm nearly all of the text is grey, and adjectives and adverbs ("very", "old", "quickly", "wide") are in the normal text colour. Confirm spaces and punctuation between words are grey too.
2. Check the heading and the bulleted list. Confirm they are treated the same way as the paragraphs.
3. Type a new sentence at the end, one word at a time. Confirm each word is greyed or kept as soon as you finish it, and typing stays smooth. Edit in the middle of an existing paragraph and confirm the colouring stays right for words after the edit (nothing shifts by one letter).
4. Add a code block and a horizontal rule if the editor offers them. Confirm the code block keeps its normal colour and is not greyed.
5. Try odd text: "a", "ly", a number, "don't", an accented word, an empty paragraph. Confirm nothing breaks, short words and numbers are grey, "don't" is coloured as one word, and nothing is half-coloured mid-word.
6. Select and copy some text and paste it into a plain document. Confirm the document text is unchanged and the grey did not come along. Confirm undo and redo are not affected by the module (no extra undo steps).
7. Open a second pane on the same document, with the module placed there too. Confirm both panes look the same. Then turn the module off and confirm normal colour returns in every pane; turn it on and confirm the grey returns.
8. Paste a long document (a few pages). Confirm typing and scrolling stay responsive.
