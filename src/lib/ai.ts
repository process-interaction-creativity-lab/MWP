// The writer's endpoint through `ctx.ai`'s `fetch`, imported by modules as
// `mwps/ai`: chat (one reply, a reply streamed as it arrives, a reply in a
// JSON schema, or a tool loop), a recording transcribed, and a picture made,
// each with the writer's model for it. Anything else the endpoint offers
// (spoken audio, embeddings) is `ai.fetch` directly.

import type { AiSettings } from 'mwps';

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/** The request body: `messages`, plus anything else the endpoint takes
 *  (`temperature`, `max_tokens`, `response_format`). `model` defaults to
 *  `ai.model`. */
export interface ChatRequest {
  readonly messages: readonly ChatMessage[];
  readonly model?: string;
  readonly [field: string]: unknown;
}

/** A request the endpoint refused: `status` is the HTTP status and `detail`
 *  the endpoint's own words from the body; the message has both. */
export class AiError extends Error {
  readonly status: number;
  readonly detail: string;
  constructor(status: number, detail: string) {
    super(`AI request failed (${status})${detail ? `: ${detail}` : ''}`);
    this.name = 'AiError';
    this.status = status;
    this.detail = detail;
  }
}

/** Why a call failed, in words for the writer, or `null` when it was stopped:
 *  an `AbortError`, whether the module aborted or the writer pressed "Stop AI
 *  calls" (which the module's own signal doesn't show). In a `catch`:
 *  `const why = failure(e); if (why) say(`Could not answer: ${why}`);`. */
export function failure(e: unknown): string | null {
  if (e instanceof DOMException && e.name === 'AbortError') return null;
  return e instanceof Error ? e.message : String(e);
}

/** The endpoint's message in an error body, or the body's start. */
export function errorDetail(body: string): string {
  try {
    const j = JSON.parse(body);
    const m = j?.error?.message ?? j?.error ?? j?.message ?? j?.detail;
    if (m !== undefined) return typeof m === 'string' ? m : JSON.stringify(m);
  } catch {
    // Not JSON: use the text.
  }
  return body.trim().slice(0, 300);
}

async function post(ai: AiSettings, body: object, signal?: AbortSignal): Promise<Response> {
  const res = await ai.fetch('/chat/completions', { method: 'POST', body: JSON.stringify({ model: ai.model, ...body }), signal });
  if (!res.ok) throw new AiError(res.status, errorDetail(await res.text().catch(() => '')));
  return res;
}

/** The model's whole reply. Rejects if the request fails or is aborted. */
export async function chat(ai: AiSettings, request: ChatRequest, signal?: AbortSignal): Promise<string> {
  const data = await (await post(ai, request, signal)).json();
  return String(data?.choices?.[0]?.message?.content ?? '');
}

/** A shape for a JSON reply, built with `shape`: it is the JSON Schema sent to the
 *  endpoint (`schema`) and the reader of what comes back (`read`), which
 *  never throws and always returns the shape's type. */
export class Shape<T> {
  constructor(
    readonly schema: object,
    readonly read: (value: unknown) => T,
  ) {}
}

type Read<P> = { [K in keyof P]: P[K] extends Shape<infer T> ? T : never };

/** Shapes for `json`. Every property of an object is required (strict
 *  `json_schema` demands it), and a reply that lacks one or has the wrong
 *  type in it reads as the shape's default: '' (trimmed), 0, false, [], or an
 *  enum's first value. Whatever else the reply holds is dropped.
 *    const Reply = shape.object({ items: shape.array(shape.object({ quote: shape.string(), score: shape.number() })) });
 *    const { items } = await json(ai, { messages }, Reply, signal);   // typed */
export const shape = {
  string: () => new Shape<string>({ type: 'string' }, (v) => (typeof v === 'string' ? v.trim() : '')),
  number: () => new Shape<number>({ type: 'number' }, (v) => finite(v)),
  /** A whole number: the reply's, rounded. */
  integer: () => new Shape<number>({ type: 'integer' }, (v) => Math.round(finite(v))),
  boolean: () => new Shape<boolean>({ type: 'boolean' }, (v) => v === true),
  enum: <const V extends string>(values: readonly V[], fallback: V = values[0]!) => new Shape<V>({ type: 'string', enum: [...values] }, (v) => ((values as readonly unknown[]).includes(v) ? (v as V) : fallback)),
  array: <T>(item: Shape<T>) => new Shape<T[]>({ type: 'array', items: item.schema }, (v) => (Array.isArray(v) ? v.map(item.read) : [])),
  object: <P extends Record<string, Shape<any>>>(props: P) =>
    new Shape<Read<P>>(
      { type: 'object', properties: Object.fromEntries(Object.entries(props).map(([k, p]) => [k, p.schema])), required: Object.keys(props), additionalProperties: false },
      (v) => {
        const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
        return Object.fromEntries(Object.entries(props).map(([k, p]) => [k, p.read(o[k])])) as Read<P>;
      },
    ),
};

// A number, or a string that is one ("3"), else 0.
function finite(v: unknown): number {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** The model's reply as JSON. With a shape from `shape` the result is typed and
 *  complete (see `shape`); with a plain JSON Schema object it is only parsed.
 *  Sent as strict `json_schema`; an endpoint that refuses that (400 or 422)
 *  is asked again with the schema in a closing message instead. A reply that
 *  doesn't parse is asked for once more; then it rejects. */
export async function json<T>(ai: AiSettings, request: ChatRequest, schema: Shape<T>, signal?: AbortSignal): Promise<T>;
export async function json<T = unknown>(ai: AiSettings, request: ChatRequest, schema: object, signal?: AbortSignal): Promise<T>;
export async function json(ai: AiSettings, request: ChatRequest, form: object, signal?: AbortSignal): Promise<unknown> {
  const schema = form instanceof Shape ? form.schema : form;
  const strict = { ...request, response_format: { type: 'json_schema', json_schema: { name: 'reply', strict: true, schema } } };
  const plain = { ...request, messages: [...request.messages, { role: 'user' as const, content: `Reply with only JSON that fits this JSON Schema:\n${JSON.stringify(schema)}` }] };
  let body: ChatRequest = strict;
  let text = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      text = await chat(ai, body, signal);
    } catch (error) {
      if (body !== strict || !(error instanceof AiError) || (error.status !== 400 && error.status !== 422)) throw error;
      body = plain;
      text = await chat(ai, body, signal);
    }
    const parsed = parseJson(text);
    if (parsed.ok) return form instanceof Shape ? form.read(parsed.value) : parsed.value;
  }
  throw new Error(`The model's reply was not JSON: ${text.slice(0, 100)}`);
}

/** JSON in a reply, allowing a code fence around it. */
export function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const body = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1');
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}

/** A tool the model may call: `parameters` is a JSON Schema object, `run`
 *  gets the parsed arguments and returns what the model is told (a string,
 *  or anything JSON). A throw is told to the model as the tool's error. */
export interface Tool {
  readonly description: string;
  readonly parameters: object;
  readonly run: (args: any) => unknown | Promise<unknown>;
}

/** Runs the model's `tool_calls` and sends it the results until it answers
 *  in text, which is returned. Rejects after `maxSteps` rounds (default 8)
 *  of tool calls without an answer. */
export async function toolLoop(
  ai: AiSettings,
  request: ChatRequest,
  tools: Readonly<Record<string, Tool>>,
  options: { signal?: AbortSignal; maxSteps?: number } = {},
): Promise<string> {
  const { signal, maxSteps = 8 } = options;
  const specs = Object.entries(tools).map(([name, t]) => ({ type: 'function', function: { name, description: t.description, parameters: t.parameters } }));
  const messages: object[] = [...request.messages];
  for (let step = 0; step < maxSteps; step++) {
    const data = await (await post(ai, { ...request, messages, tools: specs }, signal)).json();
    const message = data?.choices?.[0]?.message;
    const calls: { id: string; function: { name: string; arguments: string } }[] = message?.tool_calls ?? [];
    if (!calls.length) return String(message?.content ?? '');
    messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls });
    for (const call of calls) {
      messages.push({ role: 'tool', tool_call_id: call.id, content: await runTool(tools[call.function.name], call.function.arguments) });
    }
  }
  throw new Error(`The model was still calling tools after ${maxSteps} rounds`);
}

async function runTool(tool: Tool | undefined, rawArgs: string): Promise<string> {
  if (!tool) return 'Error: no such tool';
  const args = rawArgs?.trim() ? parseJson(rawArgs) : { ok: true as const, value: {} };
  if (!args.ok) return 'Error: the arguments were not JSON';
  try {
    const out = await tool.run(args.value);
    return typeof out === 'string' ? out : JSON.stringify(out ?? null);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** What `/audio/transcriptions` heard in `audio` (a recording such as WAV
 *  or WebM), trimmed; empty for silence. Rejects with an `AiError` if the
 *  endpoint refuses it (404, 405 or 501 where it has no transcription). */
export async function transcribe(ai: AiSettings, audio: Blob, signal?: AbortSignal): Promise<string> {
  const body = new FormData();
  body.append('file', audio, `speech.${audio.type.match(/^audio\/(?:x-)?(\w+)/)?.[1] ?? 'wav'}`);
  body.append('model', ai.transcriptionModel);
  const res = await ai.fetch('/audio/transcriptions', { method: 'POST', body, signal });
  if (!res.ok) throw await refusal(res, 'this endpoint offers no transcription');
  const reply = await res.json();
  return typeof reply?.text === 'string' ? reply.text.trim() : '';
}

/** The request body for `/images/generations`: `prompt`, plus anything else
 *  the endpoint takes. `model` defaults to `ai.imageModel`, `size` to
 *  `1024x1024`. */
export interface ImageRequest {
  readonly prompt: string;
  readonly [field: string]: unknown;
}

/** One picture for `request`, as an image source: a `data:` URL when the
 *  endpoint sends the picture itself (it is asked to), else its address.
 *  Rejects with an `AiError` if the endpoint refuses (404, 405 or 501
 *  where it makes no images), and if it sends no picture. */
export async function generateImage(ai: AiSettings, request: ImageRequest, signal?: AbortSignal): Promise<string> {
  const body = { model: ai.imageModel, n: 1, size: '1024x1024', response_format: 'b64_json', ...request };
  const res = await ai.fetch('/images/generations', { method: 'POST', body: JSON.stringify(body), signal });
  if (!res.ok) throw await refusal(res, 'this endpoint offers no image generation');
  const first = (await res.json())?.data?.[0];
  const src = typeof first?.b64_json === 'string' ? `data:image/png;base64,${first.b64_json}` : first?.url;
  if (typeof src !== 'string' || !src) throw new Error('The endpoint sent back no picture');
  return src;
}

// The statuses of an endpoint without the route asked for.
const NO_ROUTE = [404, 405, 501];

async function refusal(res: Response, noRoute: string): Promise<AiError> {
  const detail = errorDetail(await res.text().catch(() => ''));
  return new AiError(res.status, NO_ROUTE.includes(res.status) ? noRoute : detail);
}

/** `transcription` and `images`: whether the endpoint has the route. */
export type Feature = 'tools' | 'json' | 'logprobs' | 'n' | 'transcription' | 'images';

const answers = new WeakMap<object, Map<string, Promise<boolean>>>();

/** Whether the writer's endpoint and model take `feature`, for branching
 *  before a task rather than catching an error in it. Read from `/models`
 *  where it lists `supported_parameters` (OpenRouter), else by one tiny
 *  request whose reply is read (for a route, an empty one, which an
 *  endpoint with the route turns down as incomplete). An answer is
 *  remembered while these settings last (keyed by `ai.fetch` and the
 *  model). A failure that says nothing about the feature (no connection,
 *  a refused key, too many requests, a server error) is true and not
 *  remembered: the task itself then works, or reports why it can't. */
export function supports(ai: AiSettings, feature: Feature): Promise<boolean> {
  const byModel = answers.get(ai.fetch) ?? new Map<string, Promise<boolean>>();
  answers.set(ai.fetch, byModel);
  const key = `${ai.model}\n${feature}`;
  let answer = byModel.get(key);
  if (!answer) {
    answer = decide(ai, feature).catch((error) => {
      if (!saysNothing(error)) return false;
      byModel.delete(key);
      return true;
    });
    byModel.set(key, answer);
  }
  return answer;
}

// Statuses that are about the endpoint or the key, not the request's fields.
const NOT_ABOUT_THE_REQUEST = [401, 403, 408, 429];

function saysNothing(error: unknown): boolean {
  if (!(error instanceof AiError)) return true;
  return error.status >= 500 || NOT_ABOUT_THE_REQUEST.includes(error.status);
}

// The `supported_parameters` that mean a feature; `n` is never listed.
const LISTED: Record<Feature, string[] | null> = {
  tools: ['tools'],
  json: ['response_format', 'structured_outputs'],
  logprobs: ['logprobs'],
  n: null,
  transcription: null,
  images: null,
};

const ROUTES: Partial<Record<Feature, string>> = { transcription: '/audio/transcriptions', images: '/images/generations' };

async function decide(ai: AiSettings, feature: Feature): Promise<boolean> {
  const listed = LISTED[feature];
  if (listed) {
    const params = await listedParameters(ai);
    if (params) return listed.some((p) => params.includes(p));
  }
  return probe(ai, feature);
}

async function listedParameters(ai: AiSettings): Promise<string[] | null> {
  const res = await ai.fetch('/models');
  if (!res.ok) return null;
  const list = (await res.json())?.data;
  const mine = Array.isArray(list) ? list.find((m) => m?.id === ai.model) : null;
  return Array.isArray(mine?.supported_parameters) ? mine.supported_parameters : null;
}

const PROBES: Partial<Record<Feature, { extra: object; accepted: (reply: any) => boolean }>> = {
  tools: {
    extra: {
      tools: [{ type: 'function', function: { name: 'ping', description: 'Reply to the ping', parameters: { type: 'object', properties: {} } } }],
      tool_choice: { type: 'function', function: { name: 'ping' } },
    },
    accepted: (r) => r?.choices?.[0]?.message?.tool_calls?.length > 0,
  },
  json: {
    extra: { response_format: { type: 'json_schema', json_schema: { name: 'ok', strict: true, schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } } } },
    accepted: (r) => parseJson(String(r?.choices?.[0]?.message?.content ?? '')).ok,
  },
  logprobs: { extra: { logprobs: true, top_logprobs: 1 }, accepted: (r) => Array.isArray(r?.choices?.[0]?.logprobs?.content) },
  n: { extra: { n: 2 }, accepted: (r) => r?.choices?.length === 2 },
};

async function probe(ai: AiSettings, feature: Feature): Promise<boolean> {
  const route = ROUTES[feature];
  if (route) return !NO_ROUTE.includes((await ai.fetch(route, { method: 'POST', body: '{}' })).status);
  const { extra, accepted } = PROBES[feature]!;
  const reply = await (await post(ai, { messages: [{ role: 'user', content: 'Reply with {"ok": true}' }], ...extra })).json();
  return accepted(reply);
}

/** The model's reply, piece by piece as it arrives:
 *    for await (const piece of stream(ai, { messages }, s.signal)) insert(piece);
 *  Rejects if the request fails or is aborted. */
export async function* stream(ai: AiSettings, request: ChatRequest, signal?: AbortSignal): AsyncGenerator<string> {
  const res = await post(ai, { ...request, stream: true }, signal);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  const parse = streamParser();
  for (;;) {
    const { done, value } = await reader.read();
    const { pieces, finished } = parse(done ? '\n' : value);
    yield* pieces;
    if (done || finished) return;
  }
}

/** The text pieces in a server-sent event stream, fed chunk by chunk as
 *  the network splits it (a line may span chunks). `finished` once `[DONE]`
 *  arrives. Lines that aren't a text delta are skipped. */
export function streamParser(): (chunk: string) => { pieces: string[]; finished: boolean } {
  let buffer = '';
  let finished = false;
  return (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop()!;
    const pieces: string[] = [];
    for (const raw of lines) {
      if (finished) break;
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') {
        finished = true;
        break;
      }
      try {
        const piece = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (typeof piece === 'string' && piece) pieces.push(piece);
      } catch {
        // Not JSON: a keep-alive or a provider's comment.
      }
    }
    return { pieces, finished };
  };
}
