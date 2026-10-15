// Uploads every file under a local folder to the same relative path under a lake folder.
// Example: sharepoint/reference/glidepaths/site=Hull/x.csv
//   -> eu_report/reference/glidepaths/site=Hull/x.csv
// WRITES to the data lake. Existing objects are skipped unless --overwrite is given.
// Usage: node scripts/datalake-upload-tree.js [local dir] [lake root]
//          [--overwrite] [--only <list file>]
//   --overwrite   upload even when the object already exists (replaces it)
//   --only        upload only the relative paths listed in a text file, one per
//                 line (for example sharepoint/normalize-changed.txt)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { getToken } from './lib-ih.js';
import { listObjects, signedUrl, callSigned } from './lib-datalake.js';

const argv = process.argv.slice(2);
const overwrite = argv.includes('--overwrite');
const onlyAt = argv.indexOf('--only');
const onlyFile = onlyAt >= 0 ? argv[onlyAt + 1] : null;
const positional = argv.filter((a, i) => !a.startsWith('--') && (onlyAt < 0 || i !== onlyAt + 1));
const source = positional[0] || 'sharepoint/reference';
const root = positional[1] || 'eu_report/reference';
const only = onlyFile
  ? new Set(readFileSync(onlyFile, 'utf8').split(/\r?\n/).filter(Boolean))
  : null;
const { token } = await getToken();
let done = 0;
let skipped = 0;
let failed = 0;

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

const keysOf = new Map();
for (const rel of filesOf(source)) {
  if (only && !only.has(rel)) {
    continue;
  }
  const lakePath = `${root}/${rel}`;
  const folder = lakePath.replace(/[^/]+$/, '');
  if (!keysOf.has(folder)) {
    const have = await listObjects(token, folder);
    keysOf.set(folder, ((have.body.objects && have.body.objects.files) || []).map((f) => f.key));
  }
  const exists = keysOf.get(folder).some((k) => k.endsWith('/' + lakePath));
  if (exists && !overwrite) {
    skipped++;
    continue;
  }
  const bytes = readFileSync(join(source, rel));
  const r = await signedUrl(token, 'upload', lakePath);
  const put = r.url ? await callSigned('PUT', r.url, bytes) : null;
  if (put && put.res.ok) {
    done++;
    console.log(exists ? 'replaced' : 'ok', lakePath, bytes.length);
  } else {
    failed++;
    console.log('FAILED', lakePath, r.status, put ? put.res.status : '');
  }
}
console.log(`uploaded ${done}, skipped ${skipped}, failed ${failed}`);
process.exit(failed ? 1 : 0);
