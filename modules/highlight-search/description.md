# highlight-search: description

Highlight passages in yellow as you read or write, then search only inside what you highlighted. The search box shows how many matches there are, and you can step through them. Highlights are saved with the document.

**Kind:** extension. It adds highlighting and a search box to ordinary panes.

For a writer or reader who marks passages as they go and later wants to find things only among what they marked: the quotes they flagged, the claims they underlined.

- **Highlight.** A shortcut (also in the palette) highlights the selection in yellow. If the selection touches any existing highlight, the same shortcut clears highlights from the selection instead. With only a caret it does nothing. One undo reverses it. One colour is enough.
- **Highlights are part of the text.** They are saved with the file, undone, copied, pasted and shared with the text they cover, and show in every pane on the document. Adjacent highlights read as one run. Typing inside a highlight stays highlighted; typing just outside its edge does not.
- **Search box.** A toolbar box ("Find in highlights") searches only highlighted text, ignoring case and the whitespace around the query. Text outside highlights never matches, and a hit never crosses the edge of a highlighted run (two adjacent highlights count as one run). A blank query finds nothing. It works on the whole document even when the pane shows its blocks as cards.
- **Hits.** Marked in the text, the current one set apart. Editing highlighted text updates the hits at once.
- **Count.** The box shows "n of m", with a dash for n when the selection isn't on a hit, and is blank when the query is blank.
- **Stepping.** Next and previous (shortcuts, and Enter and Shift-Enter in the box) select the hit and scroll it into view, wrapping at the ends. Forward goes to the first hit at or after the end of the selection, backward to the last hit ending at or before its start. With no hits, stepping does nothing.
- **Focus.** A shortcut focuses the box; Escape in the box returns to the editor. The box is disabled until a pane is focused, and shows the focused pane's own query, so each pane keeps its own.
- **Shortcuts.** The highlight, find, next and previous shortcuts do not collide with each other or with other modules' on any platform.
- **Remembered.** Highlights travel with the file. Queries are session only: gone on reload, and never saved.
- **Turning the module off** removes the box and the hit marks; the highlights stay in the document and come back when it is on.
