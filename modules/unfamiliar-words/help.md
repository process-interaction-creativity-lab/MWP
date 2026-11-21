# unfamiliar-words: help

You want to write in plain language and need to see where your vocabulary gets fancy. This module softly highlights every word that is not on a list of familiar, everyday words, and you can edit that list.

## What it gives you

- **Unfamiliar words** (toolbar toggle, **Toggle unfamiliar-word marking** in the palette): turns the marking on or off for this pane. It is on by default.
- **Highlighted words** (the text itself): a soft highlight with a dotted underline. Hover one to read "Not in the familiar-words list". Punctuation around a word stays outside the highlight.
- **Dictionary** (toolbar button, **Edit the familiar-words list** in the palette): opens the **Familiar words** dialog, which explains the list and shows it one word per line. Commas also separate words, so you can paste a comma list.
- **Save**, **Cancel** and **Reset to default** (in the dialog): **Save** applies your list everywhere; **Cancel** closes without changes; **Reset to default** puts the bundled list in the box, and only **Save** makes it count.

## Walkthrough

1. Turn the module on and type "The cat sat on the ottoman, contemplating defenestration."
2. "ottoman", "contemplating" and "defenestration" are highlighted; "the", "cat", "sat" and "on" are not.
3. Hover a highlighted word to see the tooltip.
4. Press the **Unfamiliar words** toggle. The marks vanish; press it again and they return. Your text is untouched and nothing is added to undo.
5. Press **Dictionary**. Remove "cat", add "ottoman", and press **Save**. Now "cat" is marked and "ottoman" is not.
6. Reopen **Dictionary**, change something, and press **Cancel**; nothing changes. **Reset to default** followed by **Save** brings back the original list.

## How the pieces fit

The list decides what counts as familiar, and the toggle decides whether you see it. Case is ignored, single letters like "I" are checked, numbers are never marked, and a hyphenated word such as "well-known" is marked only if one of its parts is unfamiliar. The default list is the thousand most common words, with their usual forms, and works offline. Your edited list is yours: it follows you across documents and survives a reload, but is not stored in the file. The toggle is per pane; a list change updates every pane.

## Tips

- An empty saved list marks every word that has a letter; that is different from switching the marking off.
- Saving replaces the default list; it does not add to it.
- Turning the module off removes all marks but keeps your list.
