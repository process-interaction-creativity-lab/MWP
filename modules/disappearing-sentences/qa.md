# QA: disappearing-sentences

About five minutes. An empty document, module placed on the pane.

1. Type three sentences of one paragraph, then a fourth. Confirm that about a second after you start the second sentence the first is faint but still readable, and that the sentence you are in is never faint.
2. Keep typing and confirm each earlier sentence fades about one second after you move on from it, and sentences fade smoothly rather than flashing.
3. Click back into the first (faint) sentence. Confirm it returns to full strength at once, and that the later ones fade or not according to the caret (sentences after the caret stay clear). Type a word in a faint sentence and confirm it un-fades.
4. Move the caret quickly through three sentences (arrow keys). Confirm the one you pass through never gets stuck faint after you return, and that nothing flickers.
5. Select faint text, copy it and paste it into another document. Confirm the text is intact. Undo several times and confirm undo steps only your typing, never a "fade".
6. Open a second pane on the same document. Confirm each pane fades according to its own caret, and the unfocused pane's text stays as it is.
7. Turn the module off. Confirm everything is at full strength immediately and nothing fades afterwards. Turn it on again and confirm fading starts again. Reload and confirm the document text is exactly what you typed.
