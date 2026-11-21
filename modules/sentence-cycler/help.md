# sentence-cycler: help

You have a paragraph whose sentences might read better in another order, and you don't want to cut and paste to find out. This module lets you step through the orderings with a click.

## What it gives you

- **Sentence tints** (hover a paragraph): each sentence of a paragraph with two or more sentences is tinted in a different colour while the pointer is over it.
- **Cycle sentences** (button beside the paragraph): moves the first sentence to the end, and the rest move up. Its tooltip says "Move first sentence to the end".
- **Cycle sentences in paragraph** (palette, or **Mod-Alt-ArrowDown**): does the same for the paragraph the caret is in. It is greyed out when that paragraph has fewer than two sentences.

## Walkthrough

1. Write a paragraph of three or four sentences, with a bold word in one of them.
2. Hover over it. Each sentence gets its own colour, and a small button appears beside the paragraph.
3. Move the pointer across to the button; the tints stay while you travel.
4. Click **Cycle sentences**. The first sentence is now last, it keeps its colour, and your caret stays where it was.
5. Click again, and keep going. After as many clicks as there are sentences, you are back where you started.
6. Click your way to an order you like, or press Cmd-Z to step back one rotation at a time.
7. Put the caret in another paragraph and use the palette action (Cmd-/ or Ctrl-/) or **Mod-Alt-ArrowDown** to rotate it without the mouse.

## How the pieces fit

The button and the palette action do the same thing to one paragraph at a time. The colours exist so you can follow each sentence as it moves. The new order is real text, saved with the file, while the colours only show on hover.

## Tips

- A paragraph with fewer than two sentences gets neither tints nor button.
- Bold, italic and links stay with the right words. Spacing between sentences becomes a single space.
- One click is one undo step, so text and colours always go back together.
- Turn the module off and the tints and buttons go; the text stays in whatever order you left it.
