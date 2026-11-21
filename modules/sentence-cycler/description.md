# sentence-cycler: description

Hover over a paragraph with two or more sentences and each sentence is tinted in a different colour. A button beside the paragraph moves the first sentence to the end with each click, so you can step through the orderings. The colours travel with their sentences.

For a writer who wants to try a paragraph's sentences in a different order without cutting and pasting.

**Kind:** extension. It tints and adds a button on an ordinary editing pane, and makes one ordinary edit on the writer's behalf.

Requirements:

- **Tints and button.** Hovering a paragraph of two or more sentences tints each sentence in a gradient and shows a cycle button beside the paragraph. Moving the pointer off hides both. The pointer can go from the paragraph to the button without losing them. A paragraph with fewer than two sentences, or an empty one, gets neither.
- **Cycle.** Clicking the button rotates that paragraph only: the first sentence goes to the end, the rest move up. Sentences keep their bold, italic, links and any other module's marks and inline parts, which stay attached to the right text. Spacing between sentences becomes a single space. The click doesn't move the caret or take the selection; focus stays in the text.
- **Colours follow sentences.** A sentence keeps its colour as it moves. After as many clicks as the paragraph has sentences, the text and colours are as they began.
- **From the keyboard.** A palette action rotates the paragraph the caret is in, exactly as the button does; it is greyed out when that paragraph has fewer than two sentences.
- **Undo.** One click is one undo step, restoring text and colours together; redo likewise.
- **Other paragraphs** keep their order and colours when another paragraph is edited or cycled.
- **Data.** The rotation position is remembered with the file, so the colours still match the order after a reload.
- **Second pane** on the same document: shows the new order and matching colours (hover shows tints in whichever pane is hovered).
- **Module off:** tints and buttons go; the text stays as rotated.
