# glas-columns: help

You write with a running commentary: marginal thoughts, a gloss, a translation with notes. This module puts your text on the left and your private notes on the right, level with the paragraph each one belongs to.

## What it gives you

- **Add note** (a small + beside each paragraph): adds a blank note after that paragraph's notes and puts the caret in it.
- **Add note to paragraph** (palette, or **Mod-Alt-n**): the same, for the paragraph the caret is in.
- **Notes column** (the right side): any number of notes per paragraph, a little smaller and greyer than your text. A tall set of notes stretches its row so the columns stay aligned.
- **Enter in a note**: starts another note in the same set. You can't leave the set by typing.
- **Backspace or Delete at the edge of a set**: Backspace at the start of the paragraph after a set (or Delete at the end of the paragraph before one) selects the whole set first. Press again to delete it.

## Walkthrough

1. Open the tab menu of a pane showing a document of four or five paragraphs and turn on glas-columns. Everything sits in the left column.
2. Click the **Add note** + beside the second paragraph and type a sentence. It appears on the right, level with the paragraph.
3. Click **Add note** again for that paragraph. Both notes show together, in order.
4. Put the caret in the middle of a note and press **Enter** to split it into two notes.
5. Click into the fourth paragraph and press **Mod-Alt-n** to add a note without the mouse.
6. Press **Down** at the end of a paragraph: you go to the next paragraph, not into its notes. At the end of a set of notes, **Down** goes to the next set.
7. Drag a paragraph elsewhere, or use cards-view to move it. Its notes go with it, and one undo puts both back.

## How the pieces fit

There is one editor, so cursor, selection, undo and your other modules work as usual; this module only lays the paragraphs out in two columns. Notes are ordinary paragraphs stored right after the paragraph they comment on, so they show in every pane on the document.

## Tips

- Paragraphs inside lists and quotes stay in the left column and can't have notes.
- If you turn the module off, each set of notes shows as a grey placeholder block and nothing is lost; turn it on to get the columns back.
- On a narrow pane, notes appear under their paragraph with a rule at the left.
- Other modules that read your text, such as counters, treat notes as body text.
