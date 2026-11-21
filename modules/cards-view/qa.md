# QA: cards-view

About five minutes. Use a document with at least four blocks, mixed kinds (a heading, a few paragraphs, a list or a horizontal rule). Have a second pane on the same document if you can.

1. Switch the pane to the cards canvas from the pane's tab menu, then from the palette. Confirm there is one card per block in document order, numbered 1, 2, 3 and so on, with no card for a horizontal rule, and that the plain editor returns when you switch it off. Reload with it on and confirm it comes back on.
2. Click into a card and type. Confirm the text appears in the document (check in the second pane or by switching off) and the card keeps your caret. Edit the same block in the second pane and confirm the card updates without losing its caret.
3. In the middle of a card press Enter: confirm the second half becomes a new card beside it with the caret in it. Paste two paragraphs into a card: confirm each becomes a card. Press Backspace at the start of a card and confirm nothing happens. Press "New card" and confirm an empty card appears beside the focused one with the caret in it.
4. Drag the last card (by its header) above the first. Confirm the numbers update to match and the document's block order changes right away; check that in the second pane. Confirm the other cards kept their carets.
5. Add an empty paragraph, switch the cards off, and confirm the empty block is still there and nothing else in the document changed. Switch the cards on in only one pane and confirm the other pane stays a plain editor.
6. Turn the module off and on. Confirm the plain editor comes back with the document intact, and the cards canvas works again. Resize the pane and confirm the cards re-flow to fit its width, not the window's.
7. Drag the first card's bottom-right corner to make it wider and taller: confirm the cards in its row move right just enough, nothing overlaps, and no other card moves. Click the × on the second card: confirm it goes, the caret is in the first card, and Cmd-Z brings it back. Delete every card: confirm one empty card is left.
