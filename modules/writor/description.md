# writor: description

A writing-center tutor for a draft you are revising. Say what the piece is for and pick your goals, and it leaves a handful of comments on your sentences, with praise and critique, asking questions rather than writing for you. Tick comments off as you address them. Needs AI.

From *From Crafting Text to Crafting Thought: Grounding AI Writing Support to Writing Center Pedagogy* (Liu, Gallagher, Sterman & August, CHI '26; [paper](https://doi.org/10.1145/3772318.3790292)).

## 1. Brief

For a student or any writer revising a draft who wants a writing-center tutor rather than a ghostwriter: feedback on the thinking (thesis, organisation, development, audience) tied to their own goals, that asks questions and never writes text for them. The writer states what the piece is for and picks goals; the tutor reads the draft and leaves a handful of comments, critique and praise, each on a sentence and each with its own conversation. The writer revises in their own words and ticks comments off as addressed.

Requirements:

- **A feedback view in the side tabs** (`ui.side`, provided on each pane the module is placed on), showing while that pane is the one the writer is in. Its header: the goals, collapsed to a one-line count and expandable, with a *Set goals* button; "n / N addressed"; a *Get feedback* button; and the "AI is off" note when it applies. Below, the cards, scrolling inside the view. Removing the module from a pane removes its view and highlights; the comments' anchors stay in the document (invisible without the module) and come back when it is placed again.
- **Goals.** The *Set goals* action opens a dialog: the task and audience, the assignment or rubric, and what the writer wants feedback on (free text each). *Suggest goals* (AI, a button in the dialog) proposes five goals from those answers, the fifth always about the reader or grader; the writer ticks the ones they want and can add their own. Goals and answers belong to the document and survive reload.
- **Get feedback** (an action, and the header button; with no goals yet it opens *Set goals* first). The AI reads the whole document, the goals and the answers, and returns up to five critiques and three praises, each on one sentence. Each appears as a highlight on its sentence (critique violet, praise green) and a card in the view, in document order. While the call is out the view shows a spinner and the writer keeps typing; a comment whose sentence no longer exists word for word when the reply arrives is dropped, and the view says how many were. Running it again when feedback exists asks first, then replaces all of it (see §5).
- **Feedback never edits the writer's text.** Comments end with an open question and contain no sentence the writer could paste.
- **A card** shows its kind, a short topic ("Thesis", "Good use of evidence"), the comment, and an *Addressed* checkbox. An addressed card and its highlight are dimmed.
- **Card ↔ text.** Clicking a highlight marks its card and scrolls it into view in the view. Clicking a card moves only the selection, not the text: the editor scrolls to its sentence and the caret goes to the sentence's start, focus staying in the text. Hovering a card tints its sentence.
- **Ask about this.** With a non-empty selection, the selection bubble has *Ask about this* (also an action, greyed with no selection). It opens a small box for a question; submitting adds a card anchored to the selected text, answering in the same tutor voice.
- **Chat per card.** A card expands to a thread with a *Chat more…* input: a multi-turn conversation about that comment, its sentence, the current draft and the goals, under the same no-ghostwriting rule. *Find examples* in the thread asks for an example: first a passage from the writer's own draft that already does the thing well, quoted, else an analogy or an example on another topic. Threads survive reload.
- **The text moves under the comments.** A highlight follows its sentence as the writer edits. If the writer deletes the whole sentence, its card stays, marked "text removed", with a remove button; undoing the deletion brings the highlight back on the same card.
- **Undo.** Anchors the tutor adds, replaces or removes are the module's own edits, not on the writer's undo stack, even though the writer asked for them: Cmd-Z after feedback arrives undoes the writer's last typing, not the feedback. Clicking a card moves only the selection. Chat is the module's too: a question and its reply are kept with the document but Cmd-Z never takes them back. Ticking *Addressed*, removing a card, and *Done* in the goals dialog are the writer's edits, one undo step each: Cmd-Z after a tick unticks it, and after a removal brings the card back.
- **AI off:** *Suggest goals*, *Get feedback*, *Ask about this*, chat and *Find examples* grey out with the note in the header. Existing cards, highlights, navigation, *Addressed* and goals entered by hand keep working.
- **Several panes.** A second pane on the same document, and each pane of a split, gets its own view while focused: the same goals, cards and highlights, with which card is marked per pane.

## 2. Kind

**`extension`.** The writer revises while reading a card and its chat, so the feedback needs room beside the text that scrolls on its own and doesn't cover it: that is a side tab, following the pane the writer is in. Nothing here needs to draw the whole pane, so the module runs alongside any layout, in a split's panes and in cards.

## 3. From the paper to mwps

- **Goal wizard (four pages before the editor)** → the *Set goals* dialog. Step A (planning questions) and B (goal selection) kept; C (paste the essay) dropped, the document is the essay; D (review and submit) folded into B's *Done*. *Get Goals* (GPT-4.1-mini, Fig. 14) → *Suggest goals*, one LLM prompt: "From these answers, propose five revision goals a writing tutor would set; the fifth is about the reader or grader. One line each."
- **Initial feedback, once on submit** → the *Get feedback* action, run when the writer asks, and again later on a revised draft (re-running is added; the paper's session ended after one pass).
- **Critique pipeline (4 stages)** → LLM prompts in the same stages, may be merged into two calls: (1) pick up to four higher-order concerns relevant to the goals; (2) for them, quote the five sentences that most need work, verbatim (an insertion point is quoted as the sentence before it), each with a feedback type (reader's perspective, or example/analogy); then per sentence a comment under 700 characters that ends with an open question and contains no rewritten text.
- **Praise prompt (Fig. 13)** → one LLM prompt: the three best sentences, verbatim, each with a label "Good X" and a comment under 400 characters. Runs alongside the critiques.
- **Verbatim-sentence anchoring** → kept: each quote must match a sentence of the current text word for word; a comment whose sentence no longer exists word for word is dropped, which also covers a reply that arrives after the writer typed.
- **Feedback panel beside the editor** → the side view. **Interactive highlighting** → highlighted sentences in the text; click-to-scroll kept. Card → text and hover tint are added (the paper doesn't say whether clicking a card selects its span).
- **Highlight & Get Feedback (selection button + popup)** → *Ask about this* in the selection bubble and the palette, its question box in the bubble.
- **Feedback cards, checkbox, per-card chat, Find Examples** → kept. Chat is one LLM conversation per card, system prompt "You are a writing-center tutor… ask, don't write for them", seeded with the card, its sentence, the goals and the current draft.
- **Progress bar "n / 6"** → "n / N addressed" in the header, N being the cards there are. **Show Goals** → the collapsible goals line.
- **Bold/italic/underline editor** → dropped: formatting is other modules' job.
- **What feedback does after edits** (unspecified in the paper) → the highlight follows its text; deleted text leaves the card marked "text removed" (added).
- **Sample-text mode, Firestore, telemetry, exporting logs for tutoring (future work)** → dropped: study apparatus.

## 4. Data

- **Saved with the file:** the goals and planning answers, and every card with its chat and whether it's addressed, so a copy of the document keeps its feedback. Each card is tied to its sentence, and the tie moves with the text.
- **Undo:** as in §1: ticks, removals and goal changes undo; feedback and chat don't.
- **Forgotten on reload:** which card is marked, per pane.
- **Documents from before this version** keep their highlights but show no cards.
- **Shown from the text, never stored:** the order of the cards, "text removed", the addressed count.
