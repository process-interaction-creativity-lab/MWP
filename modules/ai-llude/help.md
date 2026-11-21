# ai-llude: help

You are writing a story and stall on what comes next. You want a nudge from the AI, but you want the words on the page to end up yours. ai-llude gives you AI text at the caret in purple, and the purple fades away only as you rewrite it.

## What it gives you

- **Continue with AI** (palette, or Tab): a short, smooth continuation of your text, about one sentence.
- **Allude with AI** (palette, or Tab): four rough fragments joined by "...": a plot beat, a setting detail, a tangent and a playful aside. It is not meant to be kept as is; it is raw material to rewrite.
- **Purple text**: everything the AI inserted stays purple, letter by letter, until you replace it. What you type is never purple, even in the middle of an AI phrase.

## Walkthrough

1. Write at least a few sentences (about 100 characters); before that, both actions are greyed out.
2. Put the caret where the story should go on, with nothing selected, and press **Tab**. A small menu opens at the caret with both actions.
3. Pick **Allude with AI** with the arrows and Enter. A pulsing placeholder marks the spot while the AI works; you can keep typing elsewhere, or press Esc to cancel.
4. Four fragments appear in purple. Read them for ideas, then rewrite: delete what you don't want and type over the rest. Each letter you type is your own colour, so you can see at a glance how much of the passage is still the AI's.
5. When you want plain momentum instead, press Tab and pick **Continue with AI**. Rewrite it the same way, or press Cmd-Z right away to remove exactly the AI's text.

## How the pieces fit

The two actions are two strengths of help: a continuation hands you finished prose, an allusion hands you a prompt. Both end in the same purple, and the purple is the point: it turns "accept or reject" into rewriting, and shows you how much of the AI's text survives. The colour is saved with the file, so it is still there when you come back.

## Tips

- Only the text before the caret is sent to the AI, never what follows it.
- If a call fails, a short note appears at the caret and nothing is inserted; press Tab to try again.
- Needs AI: set a key and model in Settings, in the project tab's menu.

## From the paper

This module comes from *Ai.llude: Encouraging Rewriting AI-Generated Text to Support Creative Expression* (Zhou & Sterman, C&C '24). [Read the paper](https://doi.org/10.1145/3635636.3656187)

### Abstract

In each step of the creative writing process, writers must grapple with their creative goals and individual perspectives. This process affects the writer’s sense of authenticity and their engagement with the written output. Fluent text generation by AIs risks undermining the reflective loop of rewriting. We hypothesize that deliberately generating imperfect intermediate text can encourage rewriting and prompt higher level decision making. Using logs from 27 writing sessions using a text generation AI, we characterize how writers adapt and rewrite AI suggestions, and show that intermediate suggestions significantly motivate and increase rewriting. We discuss the implications of this finding, and future steps for investigating how to leverage intermediate text in AI writing support tools to support ownership over creative expression.
