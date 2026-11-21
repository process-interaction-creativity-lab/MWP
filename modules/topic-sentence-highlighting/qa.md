# QA: topic-sentence-highlighting

About five minutes. Use two ordinary paragraphs of three or four sentences, a one-sentence paragraph, an empty paragraph, a heading, a block quote, a bulleted list and a code block if available.

1. With the module on, the first sentence of each ordinary paragraph is highlighted and the rest of it blurred. The one-sentence paragraph is highlighted with nothing blurred; the empty paragraph shows nothing.
2. Hover an ordinary paragraph: its blur clears smoothly, the highlight stays, other paragraphs stay blurred; move away: the blur returns.
3. The heading, quote, list and code block are each blurred as a whole, clear on hover, and have no yellow topic highlight inside, including list paragraphs.
4. Click into a blurred paragraph without hovering it (use the keyboard to move): the paragraph holding the caret is readable. Move to another: the first blurs again.
5. Type "Dr. Smith went home. He slept." into a paragraph: the highlight ends after "Dr." (accepted). A normal "?" or "!" ends a sentence where expected.
6. Delete a paragraph's first sentence, undo, redo; insert text before the first paragraph: highlight and blur follow with no drift.
7. Copy a highlighted paragraph elsewhere: no highlight or blur comes with it. Open a second pane: both show the effect, and hovering in one doesn't clear the other. Paste a few thousand words: typing stays responsive.
8. Turn the module off: all highlight and blur go at once; on: they return.
