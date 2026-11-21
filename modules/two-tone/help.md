# two-tone: help

You draft freely, then want to see and edit only what you mean to keep. two-tone lets you mark text as draft (green) or keeper (pink), and in pink mode hides all the draft behind a small marker.

## What it gives you

- **Green / Pink** (two joined toolbar buttons, per pane): choose the mode you are working in. The one in use is filled with its colour. Switching is not an undo step.
- **Word count** (toolbar): total, green and pink words for the whole document.
- **Green circle and pink circle** (selection bubble, over selected text): make the selection green or pink, one undo step each. In pink mode only the green circle shows, because everything visible is already pink.
- **Two-tone: recolour selection** (palette, Cmd-Alt-T or Ctrl-Alt-T): in green mode, makes the selection pink if it holds any green, and green if it is already all pink. In pink mode it makes the selection green, which hides it.
- **Two-tone: green mode (draft)** and **Two-tone: pink mode (keepers)** (palette, Cmd-Alt-G and Cmd-Alt-Y, or Ctrl-Alt-G and Ctrl-Alt-Y): the same as the toolbar buttons.
- **The "···" marker** (the text itself, pink mode): stands in for each hidden green passage. The caret and selection jump over it.

## Walkthrough

1. Turn two-tone on. Write a few paragraphs; everything you type is green, and the word count shows all words as green.
2. Select a sentence you like and click the pink circle in the bubble. It turns pink, and the count follows. Try the recolour key on another phrase.
3. Click **Pink** in the toolbar. Each green passage collapses into a "···" marker, and only your keepers are readable.
4. Arrow across a marker: the caret hops over it. Type a word: it is pink. Press Backspace at the edge of a marker: nothing is deleted.
5. Select across pink text and markers and press Delete, or cut: only the pink text goes. Copy the same selection and paste it elsewhere: only pink text comes along.
6. Click **Green** to see everything again. The hidden text is all still there.
7. To demote a keeper, select it and click the green circle (in pink mode this hides it).

## How the pieces fit

Colour is a label on the text; the mode is how you look at it. In green mode you see both colours and edit everything. In pink mode you see, edit and copy only the keepers, and new text always takes the colour of the mode you type in. Pink is saved with the file; the mode is not, so you start in green after a reload.

## Tips

- A second pane on the same document can be in the other mode, and typing in one never recolours the other.
- Undo brings text back with the colour it had.
- Turn the module off and all text shows, hidden text included; the colours return when you turn it on again.
