// Asking the model: the prompt, and reading its reply.

import type { Node } from 'prosemirror-model';
import type { AiSettings } from 'mwps';
import { textOf, writing } from 'mwps/text';
import { json, shape } from 'mwps/ai';
import existing from './existing.json';

export const MAX_CHARS = 6000;

export type Kind = 'extension' | 'editor replacement' | 'project';

export interface Suggestion {
  readonly title: string;
  readonly kind: Kind;
  readonly evidence: string;
  readonly pitch: string;
  readonly brief: string;
}

/** The document's prose: its textblocks, with notes and other asides left out. */
export function proseOf(doc: Node): string {
  const blocks: string[] = [];
  writing(doc).descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const t = textOf(node, pos).text.trim();
    if (t) blocks.push(t);
    return false;
  });
  return blocks.join('\n\n');
}

/** A long text as its beginning and end, with the middle marked. */
export function excerptOf(text: string, max = MAX_CHARS): string {
  if (text.length <= max) return text;
  const half = Math.floor((max - 40) / 2);
  return `${text.slice(0, half)}\n\n[... ${text.length - half * 2} characters left out ...]\n\n${text.slice(-half)}`;
}

const SYSTEM = `You are a design consultant for mwps, a modular word processor. Everything the writer sees beyond plain text comes from small modules, and the writer can commission new ones.

A module is one of three kinds:
- "extension": adds to ordinary panes, such as marks or colours drawn in the text, a toolbar button, a side tab, a panel, keys.
- "editor replacement": replaces the pane's editor with another way of showing and arranging the document, such as cards, a canvas or columns.
- "project": works across all the documents of the project, such as exporting or renaming.

You are shown an excerpt of what someone is writing and a summary of how they have been editing. Infer what they are doing (the form, the genre, the stage of the work, the habits) and propose modules that would help this person with this piece.

Rules:
- Propose 3 to 5 modules. Fewer, sharper ideas beat a long list.
- Do not propose anything in the existing-modules list. Propose adjacent or sharper ideas instead.
- Each "evidence" must cite something from what you were shown: quote a phrase from the text, or give a specific number from the activity summary. Never invent evidence. If the text is too short or the activity too thin to support an idea, say so in the evidence.
- "pitch" is two or three sentences on what the module does for them.
- "brief" is a self-contained paragraph to hand to an AI agent that builds the module: what the writer gets and sees, and which kind it is. Say what the module does, never how it is built (no code, libraries or APIs). No preamble.
- Prefer modules that only make sense for this writer. A generic word counter helps nobody.

Reply with JSON only: {"recommendations": [{"title": ..., "kind": "extension" | "editor replacement" | "project", "evidence": ..., "pitch": ..., "brief": ...}]}. No markdown fence, no commentary.`;

export function userPrompt(excerpt: string, activity: string): string {
  return [
    '## Existing modules (do not re-propose these)',
    ...(existing as string[]).map((m) => `- ${m}`),
    '',
    '## What they are writing',
    excerpt || '(The document is empty.)',
    '',
    '## How they have been editing',
    activity,
  ].join('\n');
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const taken = new Set((existing as string[]).map((m) => norm(m.split(':')[0]!)));

const Reply = shape.object({
  recommendations: shape.array(shape.object({ title: shape.string(), kind: shape.enum(['extension', 'editor replacement', 'project']), evidence: shape.string(), pitch: shape.string(), brief: shape.string() })),
});

/** The suggestions the model gives for the text: one missing its title,
 *  evidence, pitch or brief is dropped, and so is one that repeats an
 *  existing module. Throws with a message for the writer when nothing
 *  usable is left. */
export async function suggest(ai: AiSettings, excerpt: string, activity: string, signal: AbortSignal): Promise<Suggestion[]> {
  const reply = await json(ai, { messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt(excerpt, activity) }] }, Reply, signal);
  const out = reply.recommendations.filter((r) => r.title && r.evidence && r.pitch && r.brief && !taken.has(norm(r.title)));
  if (out.length === 0) throw new Error('The reply had no usable suggestions. Try again.');
  return out.slice(0, 5);
}
