// The module creator's agent: one conversation with the writer's default
// model, which builds one module with its tools: reading files, writing them
// whole, and editing them (prompt.md). Everything
// lives in this page and is gone on reload; the writer can download the
// module's folder as a zip.

import { createStore } from '../../core/store.js';
import { AiError, errorDetail } from '../../lib/ai.js';
import { host } from '../host.js';
import { currentSettings } from '../settings.js';
import { checkAndInstall } from './check.js';
import { editExact, replaceMatches, search, shown, type Match } from './edits.js';
import prompt from './prompt.md?raw';
import { allSources, exampleIds, filesOf, readSource, template } from './sources.js';
import { zip } from './zip.js';

/** One line of the conversation as the panel shows it. */
export type Entry =
  | { kind: 'writer'; text: string }
  | { kind: 'agent'; text: string }
  // A tool call: what it did, the detail behind it, and whether it went wrong.
  | { kind: 'step'; text: string; detail?: string; failed?: boolean }
  | { kind: 'error'; text: string };

export interface CreatorState {
  entries: readonly Entry[];
  running: boolean;
  /** The module being built, once the agent has named it. */
  moduleId: string | null;
  /** Its folder: file name to text. */
  files: ReadonlyMap<string, string>;
  /** Whether the last check passed (the module is installed). */
  installed: boolean;
  /**
   * What the conversation has cost, as the endpoint reports it: requests,
   * tokens, the prompt tokens read from its cache, and the cost in dollars
   * where it says (OpenRouter's `usage.cost`).
   */
  usage: Usage;
}

type Usage = { requests: number; promptTokens: number; cachedTokens: number; completionTokens: number; cost: number };

const EMPTY: CreatorState = { entries: [], running: false, moduleId: null, files: new Map(), installed: false, usage: { requests: 0, promptTokens: 0, cachedTokens: 0, completionTokens: 0, cost: 0 } };
export const creator = createStore<CreatorState>(EMPTY);

const update = (change: Partial<CreatorState>) => creator.set({ ...creator.get(), ...change });
const say = (entry: Entry) => update({ entries: [...creator.get().entries, entry] });

type Message = { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

let messages: Message[] = [];
let running: AbortController | null = null;
// Names the conversation to OpenRouter, which then keeps it on one provider
// and so in that provider's prompt cache; without it, requests move between
// providers and each move bills the whole prompt again. Other endpoints
// aren't sent it: OpenAI's may refuse a field it doesn't know.
let session = crypto.randomUUID();

// OpenRouter's cache markers, in Anthropic's form: on the fixed prompt and on
// the latest message, so each request reads from cache what the one before
// wrote. Providers that cache only when asked (Alibaba, for Qwen) need them;
// the rest cache on their own and ignore them. Only OpenRouter is sent them.
function marked(list: readonly Message[]): object[] {
  const last = list.length - 1;
  return list.map((m, i) =>
    (i === 0 || i === last) && typeof m.content === 'string' && m.content ? { ...m, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] } : m,
  );
}
// The agent's searches of its module, by text: the matches it was shown, and
// the files they were found in, so a replace answers exactly those.
let searches = new Map<string, { files: ReadonlyMap<string, string>; matches: Match[] }>();

const MAX_STEPS = 40;
const DEFAULT_URL = 'https://api.openai.com/v1';

/** The writer's default model, or null while they have set no key. */
export function creatorModel(): string | null {
  const ai = currentSettings.get().ai;
  return ai?.key ? ai.model || '(no model set)' : null;
}

const GUIDE = 'docs/work/module-framework/12-authoring-guide.md';
const CONTRACT = 'src/api/mwps.d.ts';

async function system(): Promise<string> {
  const [guide, contract] = await Promise.all([readSource(GUIDE), readSource(CONTRACT)]);
  return [
    prompt.replace('EDIT_TOOLS\n', editing() ? `${EDIT_GUIDANCE}\n` : '').replace(/<!-- ask -->\n?([\s\S]*?)<!-- \/ask -->\n?/g, asking() ? '$1' : ''),
    `## Existing modules\n\nTheir ids, which yours must not repeat. Each folder is readable: \`modules/<id>/description.md\`, \`modules/<id>/index.tsx\`.\n\n${exampleIds.join(', ')}`,
    `## Reference files\n\nAlso readable: \`src/lib/ai.ts\` (mwps/ai), \`src/lib/text.ts\` (mwps/text), \`src/lib/changes.ts\`, \`src/lib/held.ts\`, \`src/lib/idmarks.ts\`, \`src/ui/index.ts\` (mwps/ui), \`src/api/react.d.ts\` (mwps/react), \`docs/work/module-framework/tips.md\`.`,
    templateSection(),
    `## The authoring guide (${GUIDE})\n\n${guide}`,
    `## The contract (${CONTRACT})\n\n\`\`\`ts\n${contract}\n\`\`\``,
  ].join('\n\n');
}

// The module template's files, which `write_module` starts the folder from in the guide's `npm run new`'s place.
function templateSection(): string {
  const files = Object.entries(template)
    .filter(([key]) => !key.endsWith('help.md'))
    .map(([key, text]) => `### ${key.split('/').at(-1)}\n\n\`\`\`\n${text.replaceAll('MODULE_ID', '<id>')}\`\`\``);
  return `## The module template\n\nThe shape of a module's files (scripts/module-template/):\n\n${files.join('\n\n')}`;
}

// Whether the agent can search and edit files in place; `localStorage['mwps-creator-edits']
// = 'none'` leaves it whole files only, for the eval to compare.
function editing(): boolean {
  try {
    return localStorage.getItem('mwps-creator-edits') !== 'none';
  } catch {
    return true;
  }
}

const EDIT_GUIDANCE = [
  "- `edit_files_exact(edits)`: changes files already written without writing them again: each edit's `old` text, copied exactly from the file and occurring in it once, becomes `new`. It shows you the lines it changed.",
  '- `search_files(text, everywhere)`: every line where `text` occurs in your module, ignoring case, numbered; with `everywhere`, also in the example modules and libraries (to find how others do something), not numbered.',
  "- `replace_search_matches(text, replacements)`: for a change in many places (renaming a word, a class, a name): after `search_files` with the same `text`, give one replacement per numbered match, in order (a match given unchanged stays). It shows you the lines it changed.",
].join('\n');


const ALL_TOOLS = [
  tool('read_files', 'Read files: your module\'s, the reference files, the template, or any example module\'s, all in one call.', {
    paths: { type: 'array', items: { type: 'string' }, description: 'e.g. ["modules/sentence-spacing/index.tsx", "src/lib/text.ts"]' },
  }),
  tool('write_module', "Write the module's files, each whole. Submit them with submit_draft.", {
    id: { type: 'string', description: "the module's id: lowercase letters, digits and dashes; the same on every call" },
    files: {
      type: 'array',
      description: 'files to write in modules/<id>/, each whole; files left out are kept as they were',
      items: { type: 'object', properties: { path: { type: 'string', description: 'e.g. index.tsx' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false },
    },
  }),
  tool('submit_draft', "Submit the module as it is now for the writer to try: it is checked (summary, typecheck, bundle, install, a trial run); when the check passes, it is installed in the writer's app, `reply` goes to the writer and your turn ends. When it fails, you get the report.", {
    reply: { type: 'string', description: 'for the writer: two or three plain sentences on what the module does, where its controls are, and any choice you made for them' },
  }),
  tool('ask_writer', 'Ask the writer one question, only when no simplest version can be built (see the prompt); your turn ends until they answer. The module stays as last submitted.', {
    question: { type: 'string', description: 'one short question in plain words, offering the simple way out where there is one' },
  }),
  tool('edit_files_exact', "Edit the module's files in place and show the lines changed. Submit them with submit_draft.", {
    edits: {
      type: 'array',
      description: 'applied in order, each to the text the one before left; if one fails, none is applied',
      items: {
        type: 'object',
        properties: { path: { type: 'string', description: 'e.g. index.tsx' }, old: { type: 'string', description: 'text copied exactly from the file, occurring once' }, new: { type: 'string', description: 'what it becomes' } },
        required: ['path', 'old', 'new'],
        additionalProperties: false,
      },
    },
  }),
  tool('search_files', "Find every line where a text occurs, ignoring case: numbered in your module's files; with `everywhere`, also in the example modules and libraries.", {
    text: { type: 'string', description: 'the text to find, as it is (not a regex)' },
    everywhere: { type: 'boolean', description: 'also search the example modules and libraries' },
  }),
  tool('replace_search_matches', 'Replace the numbered matches of your last search for `text`, one replacement per match in order, and show the lines changed. Submit them with submit_draft.', {
    text: { type: 'string', description: 'the same text you searched for' },
    replacements: { type: 'array', items: { type: 'string' }, description: 'one per numbered match, in order; a match given unchanged stays as it is' },
  }),
];

const EDIT_TOOL_NAMES = ['edit_files_exact', 'search_files', 'replace_search_matches'];
const tools = () => ALL_TOOLS.filter((t) => (editing() || !EDIT_TOOL_NAMES.includes(t.function.name)) && (asking() || t.function.name !== 'ask_writer'));

// Whether the agent may ask the writer; the eval, with no writer to answer,
// turns it off (`localStorage['mwps-creator-ask'] = 'off'`).
function asking(): boolean {
  try {
    return localStorage.getItem('mwps-creator-ask') !== 'off';
  } catch {
    return true;
  }
}

function tool(name: string, description: string, properties: Record<string, object>) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } } };
}

/** Sends the writer's message and runs the agent until it replies. */
export async function send(text: string): Promise<void> {
  const settings = currentSettings.get().ai;
  if (running || !settings?.key) return;
  say({ kind: 'writer', text });
  messages.push({ role: 'user', content: text });
  const controller = (running = new AbortController());
  update({ running: true });
  const base = (settings.url || DEFAULT_URL).replace(/\/+$/, '');
  let reminded = false;
  const openRouter = /^https:\/\/openrouter\.ai\//.test(base);
  try {
    const instructions = await system();
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(openRouter ? { session_id: session } : {}),
          ...settings.extra,
          model: settings.model,
          messages: openRouter ? marked([{ role: 'system', content: instructions }, ...messages]) : [{ role: 'system', content: instructions }, ...messages],
          tools: tools(),
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new AiError(res.status, errorDetail(await res.text().catch(() => '')));
      const reply = await res.json();
      const used = creator.get().usage;
      const u = reply?.usage;
      update({
        usage: {
          requests: used.requests + 1,
          promptTokens: used.promptTokens + (u?.prompt_tokens ?? 0),
          cachedTokens: used.cachedTokens + (u?.prompt_tokens_details?.cached_tokens ?? 0),
          completionTokens: used.completionTokens + (u?.completion_tokens ?? 0),
          cost: used.cost + (typeof u?.cost === 'number' ? u.cost : 0),
        },
      });
      const message = reply?.choices?.[0]?.message;
      const calls: ToolCall[] = message?.tool_calls ?? [];
      const said = typeof message?.content === 'string' ? message.content.trim() : '';
      messages.push({ role: 'assistant', content: message?.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) });
      // A turn ends through submit_draft or ask_writer. Plain text with no
      // tool call is held back and the model reminded, once a turn; then
      // it is shown, and ends the turn.
      if (!calls.length) {
        if (reminded) {
          if (said) say({ kind: 'agent', text: said });
          return;
        }
        reminded = true;
        messages.push({ role: 'user', content: `(From the app, not the writer: end your turn with submit_draft${asking() ? ', or ask_writer if you must ask something' : ''}.)` });
        continue;
      }
      if (said) say({ kind: 'agent', text: said });
      let finished: string | null = null;
      for (const call of calls) {
        const result = await runTool(call.function.name, call.function.arguments);
        controller.signal.throwIfAborted();
        messages.push({ role: 'tool', tool_call_id: call.id, content: typeof result === 'string' ? result : result.content });
        if (typeof result !== 'string') finished = result.reply;
      }
      // A draft that passed, or a question, ends the turn with what it says
      // to the writer: no round more for the model to say it again.
      if (finished !== null) {
        messages.push({ role: 'assistant', content: finished });
        say({ kind: 'agent', text: finished });
        return;
      }
    }
    say({ kind: 'error', text: `Stopped after ${MAX_STEPS} rounds of tool calls.` });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') say({ kind: 'error', text: 'Stopped.' });
    else say({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    // Tool calls cut off mid-round are answered, so the conversation can go on.
    const last = messages.map((m) => m.role).lastIndexOf('assistant');
    const answered = new Set(messages.slice(last + 1).map((m) => m.tool_call_id));
    for (const call of last < 0 ? [] : (messages[last]!.tool_calls ?? [])) {
      if (!answered.has(call.id)) messages.push({ role: 'tool', tool_call_id: call.id, content: 'Error: stopped before it ran' });
    }
  } finally {
    running = null;
    update({ running: false });
  }
}

export function stop(): void {
  running?.abort();
}

/** Forgets the conversation. The module stays installed until the page reloads. */
export function startOver(): void {
  stop();
  messages = [];
  searches = new Map();
  session = crypto.randomUUID();
  creator.set(EMPTY);
}

/** The module's folder as a zip, named after it. */
export function download(): void {
  const { moduleId, files } = creator.get();
  if (!moduleId) return;
  const blob = new Blob([zip(new Map([...files].map(([name, text]) => [`${moduleId}/${name}`, text])))], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${moduleId}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// A tool's result, as the model is told it, and for a write whose check
// passed, the reply that ends the turn; a step in the panel for each.
async function runTool(name: string, rawArgs: string): Promise<string | { content: string; reply: string }> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs?.trim() ? JSON.parse(rawArgs) : {};
  } catch {
    return 'Error: the arguments were not JSON';
  }
  const str = (key: string) => (typeof args[key] === 'string' ? (args[key] as string) : '');
  // A list argument; some models send one as a JSON string, so that is read too.
  const list = (key: string): unknown[] => {
    const value = args[key];
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const { moduleId, files } = creator.get();

  // A path in the module's folder: `modules/<id>/x`, or just `x`.
  const ownFile = (path: string) => {
    const prefix = `modules/${moduleId}/`;
    const name = path.replace(/^\/+/, '');
    return name.startsWith(prefix) ? name.slice(prefix.length) : name.includes('/') && name.startsWith('modules/') ? null : name;
  };

  switch (name) {
    case 'read_files': {
      const paths = list('paths').filter((p): p is string => typeof p === 'string');
      if (!paths.length) return 'Error: name the files to read in `paths`';
      const out: string[] = [];
      for (const path of paths) {
        const file = moduleId ? ownFile(path) : null;
        const text = file && files.has(file) ? files.get(file)! : await readSource(path);
        if (text === null) {
          const id = /^modules\/([\w-]+)\/?$/.exec(path)?.[1];
          out.push(`=== ${path} ===\n${id ? `Error: that's a folder; its files: ${filesOf(id).join(', ')}` : 'Error: there is no such file'}`);
        } else out.push(`=== ${path} ===\n${text.length > 40_000 ? `${text.slice(0, 40_000)}\n[… cut at 40,000 characters]` : text}`);
      }
      say({ kind: 'step', text: `Read ${paths.join(', ')}` });
      return out.join('\n\n');
    }
    case 'write_module': {
      const id = str('id');
      const refused = idProblem(id);
      if (refused) return `Error: ${refused}`;
      const given = list('files') as { path?: unknown; content?: unknown }[];
      if (!given.length) return 'Error: `files` is empty: give each file to write as {path, content}. Nothing was written.';
      const next = new Map(moduleId ? files : []);
      for (const f of given) {
        const file = typeof f.path === 'string' ? f.path.replace(/^\/?modules\/[\w-]+\//, '') : '';
        if (!/^[\w./-]+\.(tsx?|md)$/.test(file) || file.split('/').includes('..')) return `Error: "${String(f.path)}": a module file here is .ts, .tsx or .md, inside its folder`;
        next.set(file, typeof f.content === 'string' ? f.content : '');
      }
      update({ moduleId: id, files: next, installed: false });
      const written = given.map((f) => String(f.path).replace(/^\/?modules\/[\w-]+\//, ''));
      for (const [i, f] of given.entries()) say({ kind: 'step', text: `Wrote ${written[i]}`, detail: String(f.content ?? '') });
      return `Wrote ${written.join(', ')} in modules/${id}/. Not checked yet.`;
    }
    case 'ask_writer': {
      if (!asking()) return `Error: no tool ${name}`;
      const question = str('question').trim();
      if (!question) return 'Error: give the `question` to ask';
      return { content: 'Asked; the answer comes as the next message.', reply: question };
    }
    case 'submit_draft': {
      if (!moduleId) return 'Error: there is no module yet; write its files first with write_module';
      const { ok, report } = await check(moduleId, files);
      return ok ? { content: report, reply: str('reply') || `${moduleId} is ready.` } : report;
    }
    case 'search_files': {
      if (!editing()) return `Error: no tool ${name}`;
      const text = str('text');
      if (!text) return 'Error: give the `text` to find';
      const own = moduleId ? search(files, text) : [];
      const out: string[] = [];
      if (moduleId) {
        out.push(`"${text}" in ${moduleId}: ${own.length} match${own.length === 1 ? '' : 'es'}`);
        own.slice(0, MOST_MATCHES).forEach((m, i) => out.push(`${i + 1}  ${m.file}:${m.line}  ${shown(files.get(m.file)!, m)}`));
        if (own.length > MOST_MATCHES) out.push(`… and ${own.length - MOST_MATCHES} more: too many to replace one by one; search for something longer`);
        else searches.set(text, { files, matches: own });
      }
      if (args.everywhere === true) {
        const sources = await allSources();
        const found = search(sources, text);
        const content = new Map(sources);
        out.push(`${moduleId ? '\n' : ''}Elsewhere, read only: ${found.length} match${found.length === 1 ? '' : 'es'} in ${new Set(found.map((m) => m.file)).size} files`);
        for (const m of found.slice(0, MOST_ELSEWHERE)) out.push(`${m.file}:${m.line}  ${shown(content.get(m.file)!, m)}`);
        if (found.length > MOST_ELSEWHERE) out.push(`… and ${found.length - MOST_ELSEWHERE} more; search for something longer to narrow them`);
      }
      const result = out.join('\n') || `Your module has no files yet; to search the examples, give \`everywhere\``;
      say({ kind: 'step', text: `Searched for "${text}"${args.everywhere === true ? ' everywhere' : ''}`, detail: result });
      return result;
    }
    case 'replace_search_matches': {
      if (!editing()) return `Error: no tool ${name}`;
      if (!moduleId) return 'Error: there is no module yet; write its files first with write_module';
      const text = str('text');
      const searched = searches.get(text);
      if (!searched) return `Error: search for "${text}" first with search_files, then give one replacement per match`;
      if (searched.files !== files) return `Error: the module's files changed since you searched for "${text}"; search again, then give one replacement per match`;
      const given = list('replacements').map((r) => (typeof r === 'string' ? r : String(r)));
      const replaced = replaceMatches(files, searched.matches, given);
      if (!replaced.ok) {
        say({ kind: 'step', text: `Replace failed: "${text}"`, detail: replaced.error, failed: true });
        return `Error: ${replaced.error}.`;
      }
      return applyEdit(replaced.files, replaced.report, `Replaced "${text}"`);
    }
    case 'edit_files_exact': {
      if (!editing()) return `Error: no tool ${name}`;
      if (!moduleId) return 'Error: there is no module yet; write its files first with write_module';
      const given = list('edits') as Record<string, unknown>[];
      if (!given.length) return 'Error: give at least one edit in `edits`';
      const next = new Map(files);
      const done: string[] = [];
      for (const [i, e] of given.entries()) {
        const s = (key: string) => (typeof e[key] === 'string' ? (e[key] as string) : '');
        const file = s('path').replace(/^\/?modules\/[\w-]+\//, '');
        const text = next.get(file);
        const files = [...next.keys()].join(', ');
        const applied =
          text !== undefined
            ? editExact(text, s('old'), s('new'))
            : { ok: false as const, error: file ? `the module has no file "${s('path')}"; its files: ${files}` : `it has no \`path\`: name the file it changes (${files})` };
        if (!applied.ok) {
          const error = `Error in edit ${i + 1} (${file}): ${applied.error}.${given.length > 1 ? ' No edit was applied.' : ''}`;
          say({ kind: 'step', text: `Edit failed: ${file}`, detail: error, failed: true });
          return error;
        }
        next.set(file, applied.text);
        done.push(`${file}: ${applied.report}`);
      }
      return applyEdit(next, done.join('\n'), `Edited ${[...new Set(given.map((e) => String(e.path).replace(/^\/?modules\/[\w-]+\//, '')))].join(', ')}`);
    }
    default:
      return `Error: no tool ${name}`;
  }
}

const MOST_MATCHES = 100;
const MOST_ELSEWHERE = 40;

// An edit's files, kept; what changed, for the model to read.
function applyEdit(next: Map<string, string>, report: string, step: string): string {
  update({ files: next, installed: false });
  say({ kind: 'step', text: step, detail: report });
  return `${report}\n\nNot checked yet.`;
}

// Why an id can't be the new module's, or null.
function idProblem(id: string): string | null {
  const { moduleId } = creator.get();
  if (moduleId) return id === moduleId ? null : `you are already building ${moduleId}`;
  if (!/^[a-z][a-z0-9-]*$/.test(id)) return 'an id is lowercase letters, digits and dashes, starting with a letter';
  if (exampleIds.includes(id) || host.moduleIds().includes(id)) return `there is already a module ${id}; pick another id`;
  return null;
}

async function check(id: string, files: ReadonlyMap<string, string>): Promise<{ ok: boolean; report: string }> {
  const result = await checkAndInstall(id, files);
  update({ installed: result.ok });
  say({ kind: 'step', text: result.ok ? 'Check passed: installed in the app' : 'Check failed', detail: result.report, failed: !result.ok });
  return result;
}
