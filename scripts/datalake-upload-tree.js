// Uploads the SharePoint downloads into the data lake, one folder per data type
// and one sub-folder per site: <root>/<type>/site=<site>/<file>.
// WRITES to the data lake. Existing objects are skipped, never replaced.
// Usage: node scripts/datalake-upload-tree.js [source dir] [lake root]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getToken } from './lib-ih.js';
import { listObjects, signedUrl, callSigned } from './lib-datalake.js';

const source = process.argv[2] || 'downloads/sharepoint';
const root = process.argv[3] || 'reports/static-reference';
const { token } = await getToken();
let done = 0;
let skipped = 0;
let failed = 0;

for (const site of readdirSync(source)) {
  const siteDir = join(source, site);
  if (!statSync(siteDir).isDirectory()) {
    continue;
  }
  for (const type of readdirSync(siteDir)) {
    const folder = `${root}/${type}/site=${site}/`;
    const have = await listObjects(token, folder);
    const keys = ((have.body.objects && have.body.objects.files) || [])
      .map((f) => f.key);
    for (const name of readdirSync(join(siteDir, type))) {
      const lakePath = folder + name;
      if (keys.some((k) => k.endsWith('/' + lakePath))) {
        skipped++;
        continue;
      }
      const bytes = readFileSync(join(siteDir, type, name));
      const r = await signedUrl(token, 'upload', lakePath);
      const put = r.url ? await callSigned('PUT', r.url, bytes) : null;
      if (put && put.res.ok) {
        done++;
        console.log('ok', lakePath, bytes.length);
      } else {
        failed++;
        console.log('FAILED', lakePath, r.status, put ? put.res.status : '');
      }
    }
  }
}
console.log(`uploaded ${done}, skipped ${skipped}, failed ${failed}`);
process.exit(failed ? 1 : 0);
