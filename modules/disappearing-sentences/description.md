# disappearing-sentences: description

As you write, sentences you have moved past fade to a faint grey a second after your caret leaves them, so only what you are working on stays clear. Nothing is deleted. Move back into a faded sentence and it returns at once.

For a writer who wants to keep moving forward and stop rereading.

**Kind:** extension. It only restyles text in an ordinary editing pane.

- **What fades.** A sentence is "behind the caret" when it comes before the sentence the caret is in. When the caret leaves a sentence for a later one, that sentence fades one second afterwards (fixed, not a setting). A sentence being written or edited is never faded; sentences after the caret are not faded. Sentences are split across paragraphs, and each paragraph starts a new one. Text that other modules keep inside the text (notes, alternatives) is left alone.
- **How it looks.** A smooth transition to a faint grey that is still legible, not a jump to invisible; it works in light and dark themes. With the system's reduced-motion setting on, the change is immediate.
- **Coming back.** Moving the caret into a faded sentence, or selecting text in it, restores it at once. Typing in a faded sentence restores it. Hovering does nothing.
- **Still ordinary text.** Faded text can be selected, copied, found and edited.
- **Timing.** If the caret moves on and a sentence's second hasn't finished, it still fades when the second is up, unless the caret is back in it by then. Rapid movement across several sentences never leaves a sentence stuck faded or flickering.
- **Only a look.** The document is never changed: no text, nothing in undo, nothing saved. Other panes on the document, other writers and exports see the text normally. Each pane fades by its own caret, and a pane without focus is left as it is.
- **Module off.** Everything is at full strength at once and fading stops; turning it on again resumes fading.
