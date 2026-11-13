// Compares two exports of one flow tab node by node (by id): nodes added,
// removed, and changed (which fields). Positions (x, y) are ignored.
// Usage: node scripts/diff-flow-nodes.js <old.json> <new.json>
//   or:  node scripts/diff-flow-nodes.js git:<rev>:<path> <new.json>
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const load = (arg) => JSON.parse(arg.startsWith('git:')
  ? execFileSync('git', ['show', arg.slice(4)], { encoding: 'utf8' })
  : readFileSync(arg, 'utf8'));
const [a, b] = process.argv.slice(2).map(load);
const byId = (nodes) => new Map(nodes.map((n) => [n.id, n]));
const oldMap = byId(a);
const newMap = byId(b);
const label = (n) => `${n.type} "${n.name || n.label || ''}" ${n.id}`;
const skip = new Set(['x', 'y']);

for (const n of b) {
  if (!oldMap.has(n.id)) {
    console.log('ADDED  ', label(n));
  }
}
for (const n of a) {
  if (!newMap.has(n.id)) {
    console.log('REMOVED', label(n));
  }
}
for (const n of b) {
  const o = oldMap.get(n.id);
  if (!o) {
    continue;
  }
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  const changed = [...keys].filter((k) => !skip.has(k) &&
    JSON.stringify(o[k]) !== JSON.stringify(n[k]));
  if (changed.length) {
    console.log('CHANGED', label(n), changed.join(', '));
  }
}
