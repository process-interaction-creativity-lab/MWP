# revision-stash: description

When you can't choose between phrasings, write them one after another, select them, and pick which one stays. The others fold away behind a small count on the live text. Click the count to read them, swap one in, edit them, or discard them once you have decided.

For a writer torn between phrasings of a passage who doesn't want to lose the other versions while deciding.

**Kind:** extension. It adds a control, a badge and tint on the text, a panel and a list to an ordinary editing pane.

Requirements:

- **Stashing.** Selecting two or more sentences offers a "stash alternatives" control near the selection; a selection touching only one sentence offers nothing. The selection snaps outward to whole sentences, possibly across paragraph breaks. The writer picks which sentence is the live version from a list of those sentences. The span becomes that one sentence (a stash across paragraphs merges them into one paragraph), and the others become the alternatives. Formatting inside a sentence is kept.
- **Marking.** The live text is faintly tinted and a small "+N" badge at its end shows how many alternatives are held. Both show in every pane showing the document, focused or not.
- **Managing.** Clicking the badge opens a panel beside the text, not a blocking dialog: the text stays visible and clickable. It shows the live text and the alternatives. From it the writer can make an alternative live (it and the live text swap places), edit an alternative, delete one, add a new one, or **resolve** the stash (drop all alternatives and the tint, keeping the live text). Clicking the badge works without first focusing the pane.
- **Edits to the live text are safe.** The first edit to the live text after stashing or switching saves its previous wording once as an alternative; further edits don't pile up copies. Selecting inside the live text, typing into it and splitting it across paragraphs keep the stash intact.
- **Survey.** A "Needs work (n)" control lists every stash in the document with its live text and alternative count. Choosing one scrolls to it, selects it and opens its panel. It never overlaps other modules' controls.
- **Empty stash.** Deleting the last alternative leaves the live text tinted, still listed in the survey and ready for more; only resolve clears it.
- **Undo.** Stashing, switching, resolving and each panel edit are the writer's edits and undo normally; undoing a switch swaps back.
- **Data.** The alternatives travel with the file, so anyone opening it sees them, and they come along with the text on copy, paste, undo and redo. Deleting the live text deletes its alternatives with it, and undo brings both back. They survive turning the module off and on.
- **Second pane** on the same document: tint, badge and a switch made in one show in the other.
- **Module off:** the tint, badge, panel and survey go; the live text stays as it is and the alternatives stay in the file.
- Nothing is sent anywhere; no AI, network or timers.
