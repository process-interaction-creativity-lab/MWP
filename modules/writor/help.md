# writor: help

You are revising a draft and want a writing-center tutor, not a ghostwriter. You say what the piece is for and what you want to improve, and writor leaves comments on your own sentences, praise and critique, each ending in a question for you to answer in your own words.

## What it gives you

- **Set goals** (button in the writor side tab, palette: "Set writing goals"): opens a dialog with three questions (what the piece is for and who for, the assignment or rubric, what you want feedback on), a **Suggest goals** button that proposes five goals, tick boxes to choose goals, and **Add a goal of your own**. Finish with **Done**.
- **Get feedback** (side tab button; palette: "Get feedback from the writing tutor"): the tutor reads your whole draft and leaves up to five critiques (violet highlights) and three praises (green highlights), each on one sentence. With no goals yet it opens **Set goals** first.
- **Cards** (side tab): one per comment, in document order, showing its kind, a short topic, the comment and an **Addressed** tick box. Addressed cards and their highlights dim.
- **Header** (side tab): a goals count that expands to list the goals, **Set goals**, "n / N addressed", and **Get feedback**.
- **Ask about this** (selection bubble; palette: "Ask the tutor about this"): with some text selected, opens a small box for a question and adds a card on that text.
- **Chat** (button on each card, shown as **Chat** or **Chat (n)**): a conversation about that comment, with a **Chat more…** box, **Send**, and **Find examples**, which quotes a passage of your own draft that already does the thing well, or else gives an analogy.
- **Remove** (on a card whose text is gone): marked "text removed".

## Walkthrough

1. Paste an essay of five or more paragraphs into the document and turn writor on for the pane. A writor tab appears at the right.
2. Click **Get feedback**. **Set goals** opens: answer the three questions, press **Suggest goals**, tick the ones you want, add your own, and press **Done**.
3. Click **Get feedback** again. A "Reading your draft…" note shows while the tutor works, and you can keep typing.
4. Read the cards. Click a card and the text scrolls to its sentence with your caret at its start; click a highlight and its card is marked.
5. Rewrite the sentence in your own words, then tick **Addressed**. The count in the header goes up.
6. Open **Chat** on a card and ask what the tutor means, or press **Find examples**.
7. Select a phrase you are unsure about and use **Ask about this** to get a new card.
8. Run **Get feedback** on a later draft: it asks before replacing all existing comments.

## How the pieces fit

Goals shape the feedback, the feedback becomes highlights and cards, and the cards are your to-do list for revising. Goals, cards, chats and ticks are saved with the document. The tutor never writes text for you, only asks. It follows *From Crafting Text to Crafting Thought* (Liu, Gallagher, Sterman & August, CHI '26).

## Tips

- Needs AI: set a key and model in Settings, in the project tab's menu. Without it **Suggest goals**, **Get feedback**, **Ask about this** and chat grey out and the header says "AI is off"; existing cards, **Addressed** and goals you typed by hand still work.
- Cmd-Z undoes your typing, not the tutor's comments or chats. Ticks, removing a card and **Done** in the goals dialog do undo.
- If you delete a commented sentence, its card stays marked "text removed"; undo brings the highlight back. A comment is dropped if its sentence changed before the reply arrived, and the view says so.
- A second pane on the same document shows the same cards, and each pane remembers its own marked card.

## From the paper

This module comes from *From Crafting Text to Crafting Thought: Grounding AI Writing Support to Writing Center Pedagogy* (Liu, Gallagher, Sterman & August, CHI '26). [Read the paper](https://doi.org/10.1145/3772318.3790292)

### Abstract

As AI writing tools evolve from fixing surface errors to creating language with writers, new capabilities raise concerns about negative impacts on student writers, such as replacing their voices and undermining critical thinking skills. To address these challenges, we look at a parallel transition in university writing centers from focusing on fixing errors to preserving student voices. We develop design guidelines informed by writing center literature and interviews with 10 writing tutors. We illustrate these guidelines in a prototype AI tool, Writor. Writor helps writers revise text by setting goals, providing balanced feedback, and engaging in conversations without generating text verbatim. We conducted an expert review with 30 writing instructors, tutors, and AI researchers on Writor to assess the pedagogical soundness, alignment with writing center pedagogy, and integration contexts. We distill our findings into design implications for future AI writing feedback systems, including designing for trust among AI-skeptical educators.
