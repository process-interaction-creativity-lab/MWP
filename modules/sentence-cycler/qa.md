# QA: sentence-cycler

About five minutes. Use a paragraph of three or four sentences (one with bold), a one-sentence paragraph, and a second multi-sentence paragraph.

1. Hover the multi-sentence paragraph: each sentence is tinted in a gradient and a cycle button shows beside it. Move off: both disappear. Hover the one-sentence paragraph: nothing.
2. Move the pointer slowly, straight across from the paragraph's last line to its button: the tints and the button stay shown all the way. Click it. The first sentence is now last, the bold stayed on the same words, spacing is a single space, the moved sentence kept its colour, and the caret is where it was.
3. Click until the paragraph has gone round once: text and colours are exactly as at the start; no other paragraph changed.
4. Click twice, undo once: text goes back one step and colours match. Undo again, redo twice: text and colours always agree.
5. Cycle the second paragraph, then type in the first: the second paragraph's order and colours are unchanged.
6. Use the palette action with the caret in a paragraph: it rotates like the button, and is greyed in a one-sentence paragraph.
7. Reload: the cycled order and its colours are still matched. With word-processor placed, turn a cycled paragraph into a heading (Mod-Alt-1) and back (Mod-Alt-0): the text stays as it was and each sentence keeps its colour.
8. Open a second pane on the same document, type at the end of the other paragraph in the first pane, then cycle the first paragraph with the button in the second. The first pane shows the new order too. Undo: the cycle is undone, not the typing. Turn the module off: tints and buttons go, text stays as rotated; on: they return.
