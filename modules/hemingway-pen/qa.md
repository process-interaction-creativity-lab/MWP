# QA: hemingway-pen

About five minutes. Have a document with a few sentences full of adjectives and adverbs, for example "The very old dog quickly ran across the wide, muddy field, and barked loudly. It was a well-known field."

1. Confirm the pen is off when the app opens, even if you left it on last time. Turn it on from the toolbar and confirm the pointer becomes a crosshair and clicking in the text does not move the caret.
2. Drag slowly across a sentence. Confirm a red and purple trail follows the brush and fades within a couple of seconds, and that staying over nouns and verbs ("dog", "ran") changes nothing.
3. Drag over "old", "quickly" and "muddy". Confirm each disappears with the comma or space after it, with no double space or lonely comma, and a small flash marks each removal. Strike the last word before a full stop and confirm the full stop stays. Drag over "well-known" and confirm it goes whole.
4. Scroll the wheel while the pen is on; confirm the page does not scroll. Press Escape and confirm the layer disappears and scrolling and clicking work again.
5. Press Cmd-Z repeatedly. Confirm the words come back one per undo, and redo removes them again.
6. Show two panes on one document. Type a word at the end in the left pane, turn the pen on and strike words in the right pane, press Escape, then Cmd-Z. Confirm the struck words come back (one per undo) and the word you typed stays. Confirm strokes delete words in whichever pane is under the pointer.
7. Turn the pen on from the toolbar and off with Escape (the layer covers the toolbar), and confirm the toggle matches each time. Turn the module off and confirm no layer is left.
8. Drag over numbers, punctuation only, an empty paragraph and a word like "a". Confirm nothing breaks and nothing is deleted.
