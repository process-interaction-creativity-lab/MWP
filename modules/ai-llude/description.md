# ai-llude: description

Ask for AI text at your caret in one of two forms: a smooth continuation, or four rough unrelated fragments meant to be rewritten. The inserted text shows in purple and stays purple until you rewrite it, so you can see how much is still the AI's. Needs AI.

From *Ai.llude: Encouraging Rewriting AI-Generated Text to Support Creative Expression* (Zhou & Sterman, C&C '24; [paper](https://doi.org/10.1145/3635636.3656187)).

## 1. Brief

For a creative writer who wants AI to spark the next bit of a story without writing it for them. At the caret, the writer asks for one of two kinds of AI text: a fluent **continuation**, or a deliberately broken **allusion**, four short unrelated fragments (a plot beat, a setting detail, a tangent, a whimsical aside) strung together with "...", which doesn't read as finished prose and so invites rewriting. Either kind lands in the text in purple, and stays purple character by character, so the writer can see how much of the AI's text they have rewritten into their own.

Requirements:

- **Two actions insert AI text at the caret:** *Continue with AI* and *Allude with AI* (fragments). Each is in the palette (Mod-/) and needs no further choice. They grey out while AI is off, while the selection isn't empty, and while the text before the caret is under 100 characters. They work in any text, not only paragraphs and headings: other modules' fields too, and the text before the caret in all of them is what the AI reads.
- **Both actions are on Tab.** Where both can run, Tab opens the palette at the caret listing them (and any other module's action Tab would run there, such as indent), so the writer picks one with the arrows and Enter, or Esc to close it. When they can't run, Tab does whatever it did before.
- **What is sent:** the document's text from its start up to the caret (inline asides skipped, blocks separated by line breaks), capped to the last few thousand characters for long documents. Nothing after the caret is sent.
- **While the call is out**, a small pulsing placeholder sits at the insertion point; the writer can keep typing anywhere, and text typed at the placeholder stays after it. Esc while the placeholder is in this pane, or deleting the text around it, cancels the request and nothing is inserted. Only one request per pane at a time: picking again replaces the outstanding one.
- **The answer is inserted where it was asked for** (mapped through any edits since), with a leading space when the caret followed a non-space character. It is the writer's edit, one undo step of its own: Cmd-Z right after it removes exactly the AI text and nothing they typed.
- **AI text is purple; the writer's text never is.** The inserted text carries an AI-provenance mark. Characters the writer types are never marked, even typed in the middle of a purple span, so a rewritten suggestion becomes a mix of purple and plain. Deleting purple text just deletes it. Copy and paste keeps the mark (moved text keeps its origin). The mark travels with the file. In a field that takes no marks (another module's plain-text field), the text lands unmarked.
- **A failed call inserts nothing.** A short note ("Couldn't get a suggestion. Try again.") shows at the caret for a few seconds instead.
- **Other panes:** the placeholder belongs to the pane where it was asked for; another pane on the same document sees the inserted text arrive, purple. Turning AI off cancels any outstanding request.
- **Module off:** the purple colour disappears from that pane, the mark stays in the document, and the colour returns when the module is placed again.
- Works in light and dark themes (a purple readable on both).

## 2. Kind

**`extension`.** Everything happens in the text of a normal editing pane: two actions on a key and a mark. It needs no layout and no other document.

## 3. From the paper to mwps

- **Tab drop-down with "suggestion A" and "suggestion B"** → two actions both on Tab, so Tab opens the palette at the caret with them, named. Blind, counterbalanced labels were study apparatus.
- **Suggestion A (GPT-3.5 completion, no system prompt, stop at newline or 60 tokens)** → one chat call: system prompt "Continue the writer's text from exactly where it stops. Reply with the continuation only, in the same voice, no more than about 40 words, without starting a new paragraph"; the prefix as the user message; the reply is cut at its first newline. No token cap: a reasoning model spends it thinking and returns nothing.
- **Suggestion B (four fixed prompts, each ≤15 words, joined with "...")** → four chat calls in parallel, each with the prefix and one prompt: *Plot Beat* (a next event), *Setting Detail* (a sensory detail of the place), *Benign Tangent* (a loosely related aside), *Whimsical Storyteller* (a playful narrator's remark), each "reply with one fragment of at most 15 words, no full stop", each cut to 15 words. Joined in that order with " ... ". If some fail, the rest are joined; if all fail, it is a failed call.
- **100-character minimum** → kept, as the actions' enabled state. **15-minute / 150-word lock** → dropped (study condition).
- **Per-character provenance colouring** → the AI-provenance mark, in the document, shown purple. Kept exactly, including that typed characters are never marked.
- **Insert directly, no preview, no accept step** → kept: the paper's point is that the writer accepts by leaving and rejects by deleting or rewriting. Undo is added for free, as one step.
- **Blocklist filter** → dropped: a word list is the study's safety apparatus; the configured endpoint's own moderation applies.
- **Inline error text** → changed to a transient note at the caret: error messages shouldn't enter the writing (one participant's keeping it was a charm, not a feature).
- **Toolbar, word count, timer, "AI enabled" status, save, shortcut help** → other modules and the host (word-processor, the palette, the actions' greyed state).
- **Interaction log and replay, explicit save** → dropped (study apparatus). The marks already preserve what the analysis needed: how much AI text survives.
- **"Palette of literary devices" (future work)** → not added; the four fragment prompts are fixed, as in the study.

## 4. Data

- **In the document:** the AI-provenance mark on inserted text (travels with the file). Nothing else.
- **Remembered:** nothing across reloads.
- **Session only, per pane:** the outstanding request and where its text will land.
