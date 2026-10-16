// Downloads every file under a data lake folder (recursive) into downloads/<path>.
// Read-only on the lake (list, signed download URL, GET). Existing local files of
// the same size are skipped, so it can be run again after a new VFC run.
// Usage: node scripts/datalake-download-tree.js eu_report/pbi_report/report/ [--max 200]
//   [--out <local dir>]   (default downloads/)
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getToken } from './lib-ih.js';
import { listObjects, downloadOne } from './lib-datalake.js';

const outAt = process.argv.indexOf('--out');
const OUT = outAt >= 0 ? resolve(process.argv[outAt + 1]) :
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'downloads');
const PREFIX = /^data\/ten=[^/]+\//;
const root = process.argv[2];
const maxAt = process.argv.indexOf('--max');
const max = maxAt >= 0 ? Number(process.argv[maxAt + 1]) : 500;
if (!root || !root.endsWith('/')) {
  console.error('usage: <lake folder ending with /> [--max N]');
  process.exit(2);
}
const { token } = await getToken();

// every file under a folder: [{path, size}]
async function collect(folder, out) {
  let next;
  do {
    const r = await listObjects(token, folder, next);
    const o = (r.body && r.body.objects) || {};
    for (const f of o.files || []) {
      // A folder placeholder object (key ends with a slash) is no file.
      if (String(f.key).endsWith('/')) {
        continue;
      }
      out.push({ path: f.key.replace(PREFIX, ''), size: Number(f.contentSize) });
    }
    for (const d of o.folders || []) {
      const key = String(d.key || d.path || d).replace(PREFIX, '');
      await collect(key.endsWith('/') ? key : key + '/', out);
    }
    next = r.body && r.body.isTruncated ? r.body.nextToken : null;
  } while (next);
}

const files = [];
await collect(root, files);
console.log(`found ${files.length} file(s) under ${root}`);
let got = 0;
let skipped = 0;
let failed = 0;
for (const f of files.slice(0, max)) {
  const local = resolve(OUT, f.path);
  if (existsSync(local) && statSync(local).size === f.size) {
    skipped++;
    continue;
  }
  const back = await downloadOne(token, f.path);
  if (!back.ok) {
    failed++;
    console.log('FAILED', f.path, back.why);
    continue;
  }
  mkdirSync(dirname(local), { recursive: true });
  writeFileSync(local, back.bytes);
  got++;
}
console.log(`downloaded ${got}, skipped ${skipped} (same size), failed ${failed}, into downloads/`);
process.exit(failed ? 1 : 0);
