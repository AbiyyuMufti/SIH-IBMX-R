// Uploads one local file into the data lake and checks it by downloading it again.
// WRITES to the data lake: only run it for a path you chose on purpose.
// Usage: node scripts/datalake-upload.js <local file> <lake path>
//   lake path = without the "data/ten=<tenant>/" prefix, for example
//   mufti_test/fact_loss/_upload_test.txt
// Upload = POST generateUploadObjectUrls (scope dl.ds.w, answer 201), then PUT of
// the file to the signed URL. An existing object with the same path is
// replaced (not tested here: the script refuses if the path already exists,
// unless you add --overwrite). Signed URLs and tokens are never printed.
import { readFileSync } from 'node:fs';
import { getToken } from './lib-ih.js';
import { listObjects, signedUrl, callSigned, hostOf, downloadOne } from './lib-datalake.js';

const args = process.argv.slice(2).filter((x) => x !== '--overwrite');
const overwrite = process.argv.includes('--overwrite');
const [localFile, lakePath] = args;
if (!localFile || !lakePath || /^data\/ten=/.test(lakePath)) {
  console.error('usage: <local file> <lake path without data/ten=<tenant>/> [--overwrite]');
  process.exit(2);
}

const bytes = readFileSync(localFile);
const { token } = await getToken();

// 1. refuse to replace an existing object by accident
const exists = await listObjects(token, lakePath);
const found = exists.status === 200
  && ((exists.body.objects && exists.body.objects.files) || []).length > 0;
if (found && !overwrite) {
  console.log('REFUSED: the path already exists. Use --overwrite if you mean it.');
  process.exit(1);
}

// 2. signed upload URL
const r = await signedUrl(token, 'upload', lakePath);
console.log('generateUploadObjectUrls: HTTP', r.status);
if (r.status !== 201 || !r.url) {
  console.log('FAILED', JSON.stringify(r.body).slice(0, 300));
  process.exit(1);
}
console.log('storage host:', hostOf(r.url));

// 3. PUT the file
const put = await callSigned('PUT', r.url, bytes);
console.log('PUT to the signed URL: HTTP', put.res.status, put.usedBlobHeader ? '(needed x-ms-blob-type)' : '(no extra header)');
if (!put.res.ok) {
  console.log('FAILED', (await put.res.text()).slice(0, 300));
  process.exit(1);
}

// 4. check: it is in the folder list, and the download gives the same bytes
const folder = lakePath.replace(/[^/]+$/, '');
const list = await listObjects(token, folder);
const files = (list.body.objects && list.body.objects.files) || [];
const entry = files.find((f) => f.key.endsWith('/' + lakePath));
console.log('listed after upload:', Boolean(entry), entry ? `${entry.contentSize} bytes` : '');
const back = await downloadOne(token, lakePath);
const same = back.ok && Buffer.compare(back.bytes, bytes) === 0;
console.log(`downloaded again: ${back.ok ? back.bytes.length + ' bytes' : back.why}, identical to the local file: ${same}`);
process.exit(same ? 0 : 1);
