// Saves node positions of an exported flow (for example a *.local.json
// copy edited in the VFC) to flows/layouts/<name>.json. The build scripts
// apply that file, so a rebuilt flow keeps the layout.
// Usage: node scripts/save-layout.js flows/vfc-pbi-reference.local.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { layoutKeys } from './lib-flow-builder.js';

const source = process.argv[2];
if (!source) {
  throw new Error('give the exported flow file as argument');
}
const nodes = JSON.parse(readFileSync(source, 'utf8'));
const layout = {};
layoutKeys(nodes).forEach((key, node) => {
  layout[key] = [node.x, node.y];
});
const name = basename(source).replace('.local', '');
mkdirSync(new URL('../flows/layouts/', import.meta.url), { recursive: true });
writeFileSync(
  new URL(`../flows/layouts/${name}`, import.meta.url),
  JSON.stringify(layout, null, 2) + '\n'
);
const count = Object.keys(layout).length;
console.log(`saved ${count} positions to flows/layouts/${name}`);
