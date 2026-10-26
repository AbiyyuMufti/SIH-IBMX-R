// Writes the finished code of the monitor nodes that change most often to
// files in flows/paste/, to paste into the node in the VFC (no flow import).
// Usage: node scripts/build-monitor-page-paste.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const NODES = [
  ['vfc-run-monitor', '2.1 Build monitor page', '2.1-build-monitor-page'],
  ['vfc-run-monitor', '7.1 Validate backfill', '7.1-validate-backfill']
];

mkdirSync('flows/paste', { recursive: true });

// Every "Note status" node of the two report tabs holds the same code.
const TABS = [
  ['vfc-pbi-daily-hull', 'sih-daily'],
  ['vfc-rpt-hull', 'shift']
];
TABS.forEach(([flowFile, prefix]) => {
  const flow = JSON.parse(readFileSync(`flows/${flowFile}.json`, 'utf8'));
  flow.filter((n) => n.type === 'function' && /Note status/.test(n.name))
    .forEach((n) => {
      const slug = n.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
      NODES.push([flowFile, n.name, `${prefix}-${slug}`]);
    });
});
NODES.forEach(([flowFile, name, out]) => {
  const flow = JSON.parse(readFileSync(`flows/${flowFile}.json`, 'utf8'));
  // Matched without the stage number: stages move when a lane is added.
  const bare = name.replace(/^[0-9.]+ /, '');
  const node = flow.find((n) => n.type === 'function' &&
    n.name.replace(/^[0-9.]+ /, '') === bare);
  if (!node) throw new Error(`node not found: ${name}`);
  writeFileSync(`flows/paste/${out}.js`, node.func);
  console.log(`written flows/paste/${out}.js (node "${name}")`);
});
