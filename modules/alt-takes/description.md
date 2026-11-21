# alt-takes: description

Mark a stretch of text as having alternatives. The version you like best stays in the prose, while the others sit as cards beside the page on that line. Click a card to swap it in, add new ones with the plus card, or remove the mark when you are done.

For a writer who wants to try several ways of saying the same thing and see them side by side while they write.

**Kind:** extension. It adds a mark, a selection control and a row of cards to an ordinary editing pane.

- **Marking.** Selecting some text inside one paragraph (not whitespace only, not already inside a mark) offers a "mark alternatives" control near the selection. Marking records the selected text as the first and only version. A marked span with no alternatives yet shows as a faint dotted underline; once it has alternatives it shows as a soft tint with an underline. A span can't cross a paragraph break and an alternative is a single paragraph's worth of text; a selection across paragraphs isn't offered.
- **The row of cards.** While the caret is inside a marked span, its alternatives (every version except the one in the prose) appear as cards in a row beside the page, level with the span, never covering the prose. In a pane too narrow for the page, the pane scrolls sideways to reach the row. A card shows its version's text trimmed to a few lines. A long row scrolls sideways under the mouse wheel or trackpad instead of scrolling the page. With the caret outside the span, no row shows.
- **Trying one on.** Clicking a card makes it the live version: it replaces the span's text and the old live text takes its place among the cards, as one edit that undo reverses. The caret stays in the text and the row returns to its start.
- **Adding.** A "+" card at the end of the row opens a small field for another alternative (Enter adds it, Shift+Enter makes a line break). It joins the end of the row.
- **Deleting and ending.** Each card can be deleted, except that the live text is never deleted and a mark is never left with no version. A separate control removes the mark and keeps whatever text is live. Add, delete and remove are undoable.
- **Editing the live text.** Typing in the live span changes the live version. No snapshot of the earlier wording is kept; every alternative was put there on purpose. If the live text ends up equal to an alternative already held, the two are not duplicated.
- **Formatting.** Alternatives keep their formatting (bold, italic, and marks from other modules) and bring it back when made live.
- **Data.** Alternatives travel with the file, are seen by anyone who opens it, and are carried by copy and paste (a pasted span keeps its alternatives as its own independent mark) and undo. They stay consistent when the module is off or the row is not showing.
- **Two panes on one document.** The mark and its alternatives are the same in both; the row shows in the pane the caret is in, and a switch in one shows in the other.
- **Module off.** The live text stays in the prose and reads normally; the alternatives stay in the file (they are not shown) and come back when the module is on again.
- The module's controls never cover the prose or the app's own controls. Nothing is sent anywhere; no AI, network or timers.

Unlike revision-stash, any selection can be marked, alternatives sit beside the page, and the old wording is never snapshotted. A span can't carry both modules' marks.
