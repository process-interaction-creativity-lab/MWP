# poet-critique: description

Highlight some lines and ask for a critique, and a small pixel-art cartoon of a famous poet answers in a panel beside your text, with a speech bubble giving feedback in that poet's voice. Choose from a short list or type any name. The critique is never added to your text. Needs AI.

**Kind:** extension. It adds a command, a button and a side tab, the companion, to ordinary panes.

For a poet who wants a second reaction to a draft and enjoys getting it in a famous voice, from that poet's own taste rather than a neutral workshop rubric. The critique is read and dismissed.

- **Choosing the poet.** In the companion's header, from a short built-in list (Emily Dickinson, Walt Whitman, Robert Frost, William Shakespeare, Langston Hughes, Sylvia Plath, Pablo Neruda, Maya Angelou) or a custom name, voiced from the name alone as well as the model can infer. The choice is the writer's own setting, remembered across reloads and across documents.
- **Asking.** The critique covers the highlighted text. It is available from a button in the toolbar, from the palette, from the bubble over a selection, and from the companion's header. With nothing highlighted the control is greyed with a hint to highlight something first, and asking does nothing.
- **AI.** With AI off for the module, or no key, asking is unavailable and says to turn AI on; nothing errors.
- **The voice.** The poet answers in their own voice, points at or quotes specific lines, is generous where the poem earns it without flattering what doesn't work, and keeps to a few paragraphs.
- **While waiting.** The companion shows the quoted excerpt (shortened, whitespace flattened) and a "thinking like <poet>" state with elapsed seconds, so a slow reply reads as working, not hung. A second request cannot start while one is running.
- **The reply.** Plain text with paragraph breaks kept, in a scrollable speech bubble under the excerpt. A failure (network, refused, empty or unusable reply) shows a readable message in the same bubble.
- **The portrait.** A pixel-art cartoon coloured from the poet's name, so the same poet always looks the same, a custom one too as soon as a name is typed. The bubble's tail points at its mouth. The companion belongs to the poet asked at the moment of the request: changing the poet afterwards never repaints an old reply with another face.
- **Where it sits.** In the module's side tab, beside the text, never covering it. The tab shows the companion of the pane the writer is in: each pane has its own, so a critique stays with the pane it was asked in, shows again when the writer returns to that pane, and goes when the pane closes. If the tab is closed when a critique is asked for, the writer opens it from its tab to read the reply; the request runs either way. The companion is not saved with the document.
- **Dismissing.** The writer can dismiss the companion; dismissing while a reply is pending abandons the request, and so does turning AI off for the module.
- **Editing meanwhile.** The writer can keep editing while a critique is showing or pending. Editing doesn't change or remove the excerpt shown. Nothing is written to the document, so undo has nothing to do.
- **Turning the module off** removes its side tab and abandons a pending request; the poet choice is remembered.
