// Summarise a .heapsnapshot: self size by constructor and by node type, and
// detached DOM. Used by measure-memory.ts --snapshot.
import { readFileSync } from 'node:fs';

export function summarise(file: string) {
  const snap = JSON.parse(readFileSync(file, 'utf8'));
  const { node_fields, node_types } = snap.snapshot.meta;
  const nf = node_fields.length;
  const iType = node_fields.indexOf('type'), iName = node_fields.indexOf('name'), iSize = node_fields.indexOf('self_size');
  const types: string[] = node_types[0];
  const nodes: number[] = snap.nodes;
  const strings: string[] = snap.strings;
  const byName = new Map<string, { n: number; size: number }>();
  const byType = new Map<string, { n: number; size: number }>();
  let detached = 0, detachedSize = 0, total = 0;
  const bump = (m: Map<string, { n: number; size: number }>, k: string, size: number) => {
    const e = m.get(k) ?? { n: 0, size: 0 };
    e.n++; e.size += size; m.set(k, e);
  };
  for (let i = 0; i < nodes.length; i += nf) {
    const type = types[nodes[i + iType]], name = strings[nodes[i + iName]], size = nodes[i + iSize];
    total += size;
    bump(byType, type, size);
    const label = type === 'string' || type === 'concatenated string' || type === 'sliced string' ? '(string)' : type === 'code' ? '(code)' : type === 'array' ? '(array)' : type === 'hidden' ? '(hidden)' : type === 'native' ? `native:${name.slice(0, 40)}` : name.slice(0, 60);
    bump(byName, label, size);
    if (name.startsWith('Detached ')) { detached++; detachedSize += size; }
  }
  const top = (m: Map<string, { n: number; size: number }>, k = 25) =>
    [...m].sort((a, b) => b[1].size - a[1].size).slice(0, k).map(([name, v]) => ({ name, count: v.n, selfMb: +(v.size / 2 ** 20).toFixed(2) }));
  // Largest single strings (bundled source text, serialised documents, ...).
  const bigStrings: { len: number; head: string }[] = [];
  for (let i = 0; i < nodes.length; i += nf) {
    const type = types[nodes[i + iType]];
    if (type === 'string' && nodes[i + iSize] > 200_000) bigStrings.push({ len: nodes[i + iSize], head: strings[nodes[i + iName]].slice(0, 80).replace(/\s+/g, ' ') });
  }
  bigStrings.sort((a, b) => b.len - a.len);
  return { totalMb: +(total / 2 ** 20).toFixed(1), byType: top(byType, 12), byName: top(byName, 30), detached: { nodes: detached, selfMb: +(detachedSize / 2 ** 20).toFixed(2) }, bigStrings: bigStrings.slice(0, 15) };
}
