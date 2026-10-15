// Deletes every object under one lake folder (recursive), one DELETE per file.
// DESTRUCTIVE. Only runs for a folder path of at least two parts, ending in "/".
// Usage: node scripts/datalake-delete-tree.js reports/static-reference/
import { getToken } from './lib-ih.js';
import { lakeBase, listObjects } from './lib-datalake.js';

const root = process.argv[2];
if (!root || !root.endsWith('/') || root.split('/').length < 3
  || /^data\/ten=/.test(root)) {
  console.error('usage: <folder path with at least 2 parts and a trailing />');
  process.exit(2);
}
const { token } = await getToken();

// Walk the folder tree and collect every file path (without the tenant prefix).
async function collect(folder, out) {
  let next;
  do {
    const r = await listObjects(token, folder, next);
    const o = (r.body && r.body.objects) || {};
    for (const f of o.files || []) {
      out.push(f.key.replace(/^data\/ten=[^/]+\//, ''));
    }
    for (const d of o.folders || []) {
      const key = (d.key || d.path || d).toString().replace(/^data\/ten=[^/]+\//, '');
      await collect(key.endsWith('/') ? key : key + '/', out);
    }
    next = r.body && r.body.isTruncated ? r.body.nextToken : null;
  } while (next);
}

const paths = [];
await collect(root, paths);
console.log('found', paths.length, 'files under', root);
let ok = 0;
let bad = 0;
for (const p of paths) {
  const url = lakeBase() + '/objects/' + p.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  if (res.status === 204) {
    ok++;
  } else {
    bad++;
    console.log('FAILED', p, res.status);
  }
}
const again = [];
await collect(root, again);
console.log(`deleted ${ok}, failed ${bad}, still listed ${again.length}`);
process.exit(bad || again.length ? 1 : 0);
