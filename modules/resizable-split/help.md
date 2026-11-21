# resizable-split: help

You want to see more than one thing at once: two drafts side by side, or an outline above your text. This module turns a pane into a set of panes, each with its own document and modules.

## What it gives you

- **Side by side | Stacked** (the split's tab menu): switches the whole split between columns and rows. Your documents and modules stay as they are.
- **Stacked** (palette): the same switch, shown as on while the panes are stacked.
- **Add pane** (the split's tab menu, palette): adds another pane. It starts with no document chosen, waiting for you to pick one.
- **Close pane** (each inner pane's tab menu, palette): closes that pane, or the focused one from the palette. It is not offered while only two panes remain.
- **The divider** (between panes): drag it to resize live. A pane can't be dragged down to nothing.

## Walkthrough

1. Open the tab menu of a pane and turn on resizable-split. You get two panes side by side, each asking you to pick a document.
2. Click into the left pane and pick a document with the document picker. Do the same in the right pane.
3. Open each pane's own tab and choose its modules. One can be a plain editor while the other is a card view; they don't affect each other.
4. Drag the divider to give one pane more room. Each pane scrolls on its own.
5. In the split's tab menu choose **Stacked**: the panes pile up vertically with nothing else changed.
6. Choose **Add pane**, then pick a document for the new pane.
7. Open the tab menu of the pane you no longer need and choose **Close pane**. Close panes until two remain, and the option disappears.

## How the pieces fit

The split itself shows no document; it only arranges panes, and each pane is a full pane in its own right. Orientation, the panes, and each pane's document and modules come back after a reload, but divider sizes do not. A pane inside the split can itself be split.

## Tips

- Undo belongs to each pane, not to the split as a whole.
- If two panes show the same document, edits in one appear in the other.
- Closing a pane drops its choices for good. Turning the module off and on again brings back the same panes.
