// Real tenant check of the data lake read side. No file is downloaded.
// GET /listObjects and the approved POST /generateDownloadObjectUrls. Prints status codes and field
// names, never a signed URL. Usage: node scripts/test-datalake-real.js
import { getToken } from './lib-ih.js';
import { lakeBase, listObjects, signedUrl, hostOf } from './lib-datalake.js';

const { token } = await getToken();
console.log('base:', lakeBase().replace(/\d{10}/, '<id>'));

const FOLDER = 'mufti_test/fact_loss/';
const FILE = 'mufti_test/fact_loss/fact_loss_2026-10-12.parquet';
const PREFIXED = 'data/ten=reckitt/' + FILE;

for (const folder of [FOLDER, 'data/ten=reckitt/' + FOLDER]) {
  const r = await listObjects(token, folder);
  const body = r.body || {};
  const files = (body.objects && body.objects.files) || [];
  console.log(`\nlist "${folder}": HTTP ${r.status}`);
  if (r.status !== 200) {
    console.log('  body:', JSON.stringify(r.body).slice(0, 300));
    continue;
  }
  console.log('  top-level fields:', Object.keys(body).join(', '));
  console.log('  files:', files.length, '| folders:', ((body.objects || {}).folders || []).length, '| truncated:', body.isTruncated);
  console.log('  first keys:', files.slice(0, 3).map((f) => `${f.key} (${f.contentSize} bytes)`).join(' | '));
  console.log('  has the target file:', files.some((f) => f.key.endsWith(FILE)));
}

for (const path of [FILE, PREFIXED]) {
  const r = await signedUrl(token, 'download', path);
  console.log(`\ndownload URL for "${path}": HTTP ${r.status}`);
  if (r.url) {
    console.log('  got a signed URL on host:', hostOf(r.url));
  } else {
    console.log('  body:', JSON.stringify(r.body).slice(0, 300));
  }
}
