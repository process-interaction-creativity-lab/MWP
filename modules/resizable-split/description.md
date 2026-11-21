# resizable-split: description

Splits the page into two or more areas, side by side or stacked, for example two drafts, or an outline above your text. Each area picks its own document and modules. Drag the divider to resize, and add or close areas as you like.

> **Anchor fixture** (2026-10-25): the e2e journeys place this module. Keep the action titles "Add pane", "Stacked" and "Close pane", and the orientation control's "Stacked", as they are, or change them together with the journeys in `e2e/`.

**Kind:** editorReplacement. It shows no document of its own; it arranges panes the writer chooses.

For a writer who wants to see more than one thing at once: two drafts side by side, an outline above the text, the document and a reference. A pane with this module becomes a container of two or more panes. Each inner pane is a full pane in its own right.

- **Panes.** A split starts with two. The writer can add another and close any pane, but never below two: Close pane is not offered while two remain. A new pane starts with no document chosen, asking the writer to pick one. Panes can't be reordered.
- **Orientation.** Side by side or stacked, for the whole split: a two-way "Side by side | Stacked" control in the split's tab, and a "Stacked" action in the palette (shown as on while stacked). Changing it leaves every pane's document and modules as they are.
- **Resizing.** Dragging the divider between two panes resizes them live; each pane scrolls on its own. A pane cannot be dragged to nothing. Sizes are not remembered across reloads.
- **Independent panes.** Each inner pane is the writer's own, with its own tab. The writer chooses its document (with the document picker, while it is focused) and its own modules (in its tab), so one pane can be a plain editor and another a card view. Nothing is shared unless two panes show the same document, where edits appear in both.
- **Focus.** Placing a split puts focus in its first pane, so the document picker opens a document there.
- **Where the controls are.** The orientation control and "Add pane" are in the split's tab menu. "Close pane" is in each inner pane's tab menu, offered only while the split has more than two panes. All three are also palette actions; Close pane closes the focused inner pane.
- **Remembered.** The orientation, the panes, and each pane's own document and modules come back after a reload. Closing a pane drops its choices for good.
- **Undo** is per inner pane: the split has no history of its own.
- **Nesting.** An inner pane can itself be a split, and behaves the same way without affecting the outer one.
- **Turning the module off** returns the plain pane; turning it on brings the split back with the same panes.
