# two-tone: description

Text is either green, for draft, or pink, for keepers. In pink mode all the green text is hidden behind a small marker, so you read, edit and copy only what you mean to keep. New text takes the colour of the mode you type in.

For a writer who drafts freely and then wants to see and edit only what is meant to stay.

**Kind:** extension. It changes how typing, deleting, selecting and copying behave in an ordinary editing pane, and paints the text.

Requirements:

- **Colours.** Text is green (draft, the default; text the module never touched is green) or pink (keeper). In green mode green text shows green and pink text pink. In pink mode each green run is hidden behind a small "···" marker, so only pink text can be read, edited or copied. Pink is saved with the file; a green run never crosses a paragraph, and an all-pink paragraph shows no marker in pink mode.
- **Modes.** Green and pink are chosen per pane from two joined toolbar buttons, Green and Pink, the one in use filled with its colour, and from palette actions with keys that don't clash with other modules' on any platform. The mode is not part of the document: switching is not an undo step, two panes on one document can be in different modes, and it starts green after a reload.
- **New text** takes the colour of the mode, never of its neighbours: typed, dictated or pasted text and text replacing a selection are pink in pink mode and green in green mode. Pasted text keeps its formatting.
- **Hidden text is skipped.** In pink mode the caret and selection never rest inside a hidden run but jump over it in the direction of travel.
- **Deleting.** In pink mode Backspace, Delete, cut and replacing a selection remove only the pink text in range; hidden green text stays, and Backspace at the edge of a hidden run deletes nothing. In green mode they remove everything in range.
- **Copy and cut** in pink mode put only the pink text on the clipboard, paragraphs separated by newlines; if the range holds no pink, nothing is copied.
- **Selection buttons.** Over a selection, the selection bubble shows a green circle (make it green) and, in green mode, a pink circle (make it pink). In pink mode only the green circle shows, since everything visible is already pink. Each is one undo step, and each is also a palette action.
- **Recolour key.** In green mode it makes the selection pink if it holds any green text, and green if it is already all pink. In pink mode it makes the selection green, which hides it. With no selection it does nothing.
- **Word count.** The toolbar shows total, green and pink words for the whole document, not only the focused pane's selection or card. A word straddling a colour boundary counts once on each side.
- **Only the writer's own edits** in a pane are coloured or guarded. Undo, redo, and edits from other panes, other modules or collaborators keep the colours they have, so two panes never recolour each other's typing.
- **Undo** returns text with the colour it had.
- **Module off:** all text shows, hidden text included, and the colours stay in the file for when it is back on.
