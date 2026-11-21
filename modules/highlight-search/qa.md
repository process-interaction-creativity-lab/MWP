# QA: highlight-search

About five minutes. Use a document with several paragraphs in which some word, say "river", appears several times.

1. Select a phrase containing "river" and use the highlight shortcut. Confirm it turns yellow. Select part of it plus some plain text and use the shortcut again; confirm highlights are cleared from the selection. Confirm it does nothing with only a caret. Undo each step and confirm it reverses.
2. Highlight "river" in two places and leave one "river" plain. Type "river" in the box. Confirm only the two highlighted ones are marked, the count reads "- of 2" until the selection sits on a hit, and the plain one is not marked. Try "RIVER" and " river " and confirm the same hits.
3. Press Enter in the box, then again. Confirm the selection lands on each hit in turn, scrolled into view, with "1 of 2", "2 of 2", then wrapping. Shift-Enter and the previous shortcut go the other way. Escape returns focus to the editor.
4. Highlight two adjacent pieces so a word falls across the seam; confirm it is found as one. Confirm a hit that would stretch past the edge of a highlight is not found.
5. Edit a highlighted "river" to "rivers" and then "rive". Confirm hits and count update at once. Clear the box and confirm marks and count vanish.
6. Open a second pane on the same document. Confirm highlights appear in both, the second pane has its own empty query, and a query there does not change the first. Click between panes and confirm the box shows each pane's query.
7. Reload: highlights remain, queries are empty. Turn the module off and on: highlights stay and the box returns. On Windows or Linux, confirm none of the shortcuts triggers another module's action.
