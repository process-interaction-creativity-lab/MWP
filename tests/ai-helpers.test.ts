// The `mwps/ai` helpers against a fake endpoint: replies parsed, the tool loop run, errors carrying the endpoint's words.

import type { AiSettings } from 'mwps';
import { describe, expect, it } from 'vitest';
import { AiError, chat, errorDetail, json, parseJson, shape, supports, toolLoop } from '../src/lib/ai.js';

// An `ai` whose endpoint answers each request from `replies` in turn (a
// function gets the parsed body); `calls` records the bodies and paths.
function fake(replies: (object | ((body: any, path: string) => object | Response))[], model = 'm') {
  const calls: { path: string; body: any }[] = [];
  const ai: AiSettings = {
    model,
    fetch: async (path, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, body });
      const next = replies[Math.min(calls.length - 1, replies.length - 1)];
      const out = typeof next === 'function' ? next(body, path) : next;
      return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 });
    },
  } as AiSettings;
  return { ai, calls };
}
const text = (content: string) => ({ choices: [{ message: { content } }] });
const toolCall = (id: string, name: string, args: string) => ({ choices: [{ message: { content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: args } }] } }] });
const msgs = [{ role: 'user' as const, content: 'hi' }];

describe('errors', () => {
  it('carry the status and the endpoint message', async () => {
    const { ai } = fake([new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 })]);
    const error = await chat(ai, { messages: msgs }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.status).toBe(404);
    expect(error.message).toBe('AI request failed (404): model not found');
  });
  it('read a message from the shapes endpoints use, or the raw text', () => {
    expect(errorDetail('{"error":"too many requests"}')).toBe('too many requests');
    expect(errorDetail('{"message":"bad key"}')).toBe('bad key');
    expect(errorDetail('Bad gateway\n')).toBe('Bad gateway');
    expect(errorDetail('')).toBe('');
  });
});

describe('json', () => {
  const schema = { type: 'object', properties: { a: { type: 'number' } }, required: ['a'] };
  it('sends the schema and parses the reply, also inside a code fence', () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJson('sure: {"a":1}')).toEqual({ ok: false });
  });
  it('retries once on a bad parse, then rejects', async () => {
    const one = fake([text('nope'), text('{"a":2}')]);
    expect(await json(one.ai, { messages: msgs }, schema)).toEqual({ a: 2 });
    expect(one.calls[0].body.response_format.json_schema.schema).toEqual(schema);
    expect(one.calls).toHaveLength(2);
    const two = fake([text('nope')]);
    await expect(json(two.ai, { messages: msgs }, schema)).rejects.toThrow('not JSON');
    expect(two.calls).toHaveLength(2);
  });
});

describe('json with a shape', () => {
  const Reply = shape.object({ items: shape.array(shape.object({ quote: shape.string(), score: shape.number(), kind: shape.enum(['a', 'b']), ok: shape.boolean() })) });
  it('emits a strict schema and reads the reply as typed, complete data', async () => {
    const { ai, calls } = fake([text('{"items":[{"quote":"  hi ","score":"3","kind":"c"},{"score":null},7],"extra":1}')]);
    const r = await json(ai, { messages: msgs }, Reply);
    expect(r).toEqual({
      items: [
        { quote: 'hi', score: 3, kind: 'a', ok: false },
        { quote: '', score: 0, kind: 'a', ok: false },
        { quote: '', score: 0, kind: 'a', ok: false },
      ],
    });
    const sent = calls[0].body.response_format.json_schema;
    expect(sent.strict).toBe(true);
    expect(sent.schema.required).toEqual(['items']);
    expect(sent.schema.additionalProperties).toBe(false);
    expect(sent.schema.properties.items.items.required).toEqual(['quote', 'score', 'kind', 'ok']);
  });
  it('reads a reply of the wrong type as the empty shape', async () => {
    expect(await json(fake([text('[1,2]')]).ai, { messages: msgs }, Reply)).toEqual({ items: [] });
    expect(await json(fake([text('"x"')]).ai, { messages: msgs }, shape.object({ n: shape.integer() }))).toEqual({ n: 0 });
  });
  it('asks again with the schema in the prompt when the endpoint refuses json_schema', async () => {
    const { ai, calls } = fake([new Response('{"error":"response_format unsupported"}', { status: 400 }), text('```json\n{"items":[]}\n```')]);
    expect(await json(ai, { messages: msgs }, Reply)).toEqual({ items: [] });
    expect(calls).toHaveLength(2);
    expect(calls[1].body.response_format).toBeUndefined();
    expect(calls[1].body.messages.at(-1).content).toContain('"quote"');
    const down = fake([new Response('{"error":"bad key"}', { status: 401 })]);
    await expect(json(down.ai, { messages: msgs }, Reply)).rejects.toThrow('401');
    expect(down.calls).toHaveLength(1);
  });
});

describe('toolLoop', () => {
  const tools = {
    add: { description: 'add', parameters: { type: 'object' }, run: ({ a, b }: { a: number; b: number }) => a + b },
    boom: { description: 'fails', parameters: { type: 'object' }, run: () => { throw new Error('broken'); } },
  };
  it('runs tool calls and returns the text answer', async () => {
    const { ai, calls } = fake([toolCall('1', 'add', '{"a":2,"b":3}'), text('five')]);
    expect(await toolLoop(ai, { messages: msgs }, tools)).toBe('five');
    expect(calls[0].body.tools[0].function.name).toBe('add');
    const last = calls[1].body.messages;
    expect(last.at(-2).tool_calls[0].id).toBe('1');
    expect(last.at(-1)).toEqual({ role: 'tool', tool_call_id: '1', content: '5' });
  });
  it('tells the model about a failing tool, a missing one and bad arguments', async () => {
    const { ai, calls } = fake([toolCall('1', 'boom', '{}'), toolCall('2', 'nope', '{}'), toolCall('3', 'add', '{oops'), text('done')]);
    expect(await toolLoop(ai, { messages: msgs }, tools)).toBe('done');
    const tail = calls[3].body.messages.filter((m: any) => m.role === 'tool').map((m: any) => m.content);
    expect(tail).toEqual(['Error: broken', 'Error: no such tool', 'Error: the arguments were not JSON']);
  });
  it('stops after the step cap', async () => {
    const { ai, calls } = fake([toolCall('1', 'add', '{"a":1,"b":1}')]);
    await expect(toolLoop(ai, { messages: msgs }, tools, { maxSteps: 3 })).rejects.toThrow('3 rounds');
    expect(calls).toHaveLength(3);
  });
});

describe('supports', () => {
  it('reads supported_parameters where /models lists them, and probes `n`', async () => {
    const { ai, calls } = fake([
      (_b, path) => (path === '/models' ? { data: [{ id: 'm', supported_parameters: ['tools', 'response_format'] }] } : { choices: [{}, {}] }),
    ]);
    expect(await supports(ai, 'tools')).toBe(true);
    expect(await supports(ai, 'json')).toBe(true);
    expect(await supports(ai, 'logprobs')).toBe(false);
    expect(await supports(ai, 'n')).toBe(true);
    expect(calls.filter((c) => c.path === '/models')).toHaveLength(3);
    expect(calls.filter((c) => c.path === '/chat/completions')).toHaveLength(1);
  });
  it('probes with one request where /models says nothing, and caches', async () => {
    const { ai, calls } = fake([
      (_b, path) => (path === '/models' ? { data: [{ id: 'm' }] } : text('{"ok":true}')),
    ]);
    expect(await supports(ai, 'json')).toBe(true);
    expect(await supports(ai, 'json')).toBe(true);
    expect(calls.filter((c) => c.path === '/chat/completions')).toHaveLength(1);
    expect(await supports(ai, 'logprobs')).toBe(false);
  });
  it('is false when the request fails', async () => {
    const { ai } = fake([new Response('{"error":{"message":"no"}}', { status: 400 })]);
    expect(await supports(ai, 'n')).toBe(false);
  });
});
