// Compares a local folder tree with the same tree in the data lake (read-only).
// For every local file: is it in the lake, and is the size the same?
// Then it downloads SAMPLE random files and compares the bytes.
// Usage: node scripts/datalake-verify-tree.js <local dir> <lake root> [sample]
//   example: node scripts/datalake-verify-tree.js sharepoint/reference eu_report/reference 3
// Signed URLs and tokens are never printed.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { getToken } from './lib-ih.js';
import { listObjects, downloadOne } from './lib-datalake.js';

const [source, root, sampleArg] = process.argv.slice(2);
if (!source || !root) {
  console.error('usage: <local dir> <lake root> [sample count]');
  process.exit(2);
}
const SAMPLE = Number(sampleArg || 3);
const { token } = await getToken();

// every file under dir, as a path relative to the source folder with "/"
function filesOf(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...filesOf(full));
    } else {
      out.push(relative(source, full).split(sep).join('/'));
    }
  }
  return out;
}

// size of every object of a lake folder, by key without the tenant prefix
async function sizesOf(folder) {
  const sizes = new Map();
  let next;
  do {
    const r = await listObjects(token, folder, next);
    const files = (r.body && r.body.objects && r.body.objects.files) || [];
    for (const f of files) {
      sizes.set(f.key.replace(/^data\/ten=[^/]+\//, ''), f.contentSize);
    }
    next = r.body && r.body.isTruncated ? r.body.nextToken : null;
  } while (next);
  return sizes;
}

const local = filesOf(source);
const lakeSizes = new Map();
const folders = new Set(local.map((p) => `${root}/${p}`.replace(/[^/]+$/, '')));
for (const folder of folders) {
  for (const [k, v] of await sizesOf(folder)) {
    lakeSizes.set(k, v);
  }
}
let missing = 0;
let different = 0;
for (const rel of local) {
  const key = `${root}/${rel}`;
  const size = statSync(join(source, rel)).size;
  if (!lakeSizes.has(key)) {
    missing++;
    console.log('MISSING', key);
  } else if (lakeSizes.get(key) !== size) {
    different++;
    console.log('SIZE DIFFERS', key, 'local', size, 'lake', lakeSizes.get(key));
  }
}
console.log(`local ${local.length}, in lake with same size ${local.length - missing - different}, missing ${missing}, size differs ${different}`);

// byte compare of a random sample
const shuffled = [...local].sort(() => Math.random() - 0.5).slice(0, SAMPLE);
let bad = 0;
for (const rel of shuffled) {
  const key = `${root}/${rel}`;
  const back = await downloadOne(token, key);
  const same = back.ok && Buffer.compare(back.bytes, readFileSync(join(source, rel))) === 0;
  if (!same) {
    bad++;
  }
  console.log(`download ${key}: ${back.ok ? back.bytes.length + ' bytes' : back.why}, identical: ${same}`);
}
process.exit(missing || different || bad ? 1 : 0);
