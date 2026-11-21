# highlight-search: help

You mark passages as you read or write, such as quotes you flagged or claims you underlined, and later want to search only among what you marked. highlight-search gives you a yellow highlighter and a search box that looks only inside it.

## What it gives you

- **Highlight selection** (palette, **Cmd-Alt-H** or **Ctrl-Alt-H**): turns the selected text yellow. If the selection touches an existing highlight, the same key clears highlights from it instead. With only a caret, it does nothing.
- **Find in highlights** (toolbar box, and palette action; **Cmd-Alt-F** or **Ctrl-Alt-F** to jump into the box): searches only highlighted text, ignoring case and spaces around your query. Matches are marked in the text, and the current one stands out.
- **Count** (next to the box): shows "n of m", with a dash for n when your selection is not on a match. It is blank when the box is empty.
- **Next highlight match** (palette, **Cmd-Alt-N** or **Ctrl-Alt-N**; **Enter** in the box): selects the next match and scrolls to it, wrapping at the end.
- **Previous highlight match** (palette, **Cmd-Alt-P** or **Ctrl-Alt-P**; **Shift-Enter** in the box): the same, going backwards.

## Walkthrough

1. Write several paragraphs in which a word like "river" appears a few times.
2. Select a phrase containing "river" and press **Cmd-Alt-H**. It turns yellow. Do the same in a second place, and leave one "river" plain.
3. Press **Cmd-Alt-F** and type "river" in the box. Only the two highlighted ones are marked; the plain one is not. The count reads "– of 2".
4. Press **Enter**. The first match is selected and the count reads "1 of 2". Press **Enter** again for the second, and once more to wrap. **Shift-Enter** goes back.
5. Press **Esc** in the box to return to the editor.
6. Select part of a highlight plus some plain text and press **Cmd-Alt-H** again: the highlight is cleared from the selection. **Cmd-Z** undoes it.
7. Open a second pane on the same document. The highlights show there too, but its search box starts empty and keeps its own query.

## How the pieces fit

Highlighting decides what is searchable, and the box only ever looks inside it. A match never reaches past the edge of a highlighted run, though two touching highlights count as one run. Highlights are part of the text: they are saved with the file, copied, pasted and undone with it. Queries are not saved and are gone after a reload.

## Tips

- Typing inside a highlight stays highlighted; typing just outside its edge does not.
- Turning the module off removes the box and the match marks, but the highlights stay in the document.
- The box is disabled until a pane is focused.
