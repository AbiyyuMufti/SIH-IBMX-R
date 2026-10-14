// Tests the data lake scripts against a fake server on localhost (no network, no credentials).
// The fake server copies what the real tenant did on 2026-10-14 (and the OpenAPI file):
//   base path /datalake-<id>/v3, POST generate*ObjectUrls answers 201, download takes exactly 1 path,
//   a missing object answers 404 ObjectNotFoundError, list keys carry the "data/ten=<tenant>/" prefix,
//   the signed URL is used without a token (GET to download, PUT to upload).
// Usage: node scripts/test-datalake-mock.js
import http from 'node:http';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'downloads');
const BASE = '/datalake-1000001700/v3';
const PREFIX = 'mock_test/fact_loss/fact_loss_';
const store = new Map([
  [PREFIX + '2026-10-10.parquet', Buffer.from('PAR1-ten')],
  [PREFIX + '2026-10-11.parquet', Buffer.from('PAR1-eleven')],
  [PREFIX + '2026-10-12.parquet', Buffer.from('PAR1-twelve')]
]);
const seen = { generate: [], tokenAuth: null, signedAuth: [], batchSizes: [] };

const server = http.createServer((req, res) => {
  let body = [];
  req.on('data', (c) => body.push(c));
  req.on('end', () => {
    body = Buffer.concat(body);
    const url = new URL(req.url, 'http://x');
    const json = (status, obj) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(obj));
    };
    if (url.pathname === '/oauth/token') {
      seen.tokenAuth = String(req.headers.authorization || '').split(' ')[0];
      return json(200, { access_token: 'fake', token_type: 'bearer', expires_in: 1799 });
    }
    if (url.pathname.startsWith('/files/')) {
      seen.signedAuth.push(req.headers.authorization || null);
      const key = decodeURIComponent(url.pathname.slice(7));
      if (req.method === 'PUT') {
        store.set(key, body);
        res.statusCode = 200;
        return res.end();
      }
      res.statusCode = store.has(key) ? 200 : 404;
      return res.end(store.get(key) || '');
    }
    if (!url.pathname.startsWith(BASE + '/')) {
      return json(404, {});
    }
    const op = url.pathname.slice(BASE.length + 1);
    if (op === 'listObjects') {
      const p = url.searchParams.get('path');
      const files = [...store.entries()]
        .filter(([k]) => (p.endsWith('/') ? k.startsWith(p) && !k.slice(p.length).includes('/') : k === p))
        .map(([k, v]) => ({ key: 'data/ten=mock/' + k, lastModified: '2026-10-14T07:00:00.000Z', contentSize: v.length }));
      return json(200, { storagePath: 'data/ten=mock/' + p, isTruncated: false, objects: { files, folders: [] } });
    }
    if (op === 'generateDownloadObjectUrls' || op === 'generateUploadObjectUrls') {
      const paths = JSON.parse(body.toString()).paths.map((x) => x.path);
      seen.batchSizes.push(paths.length);
      if (op === 'generateDownloadObjectUrls' && paths.length !== 1) {
        return json(400, { errors: [{ code: 'mdsp.core.datalake.tooManyPaths', message: 'A maximum of 1 paths can be provided per request.' }] });
      }
      if (op === 'generateDownloadObjectUrls' && !store.has(paths[0])) {
        return json(404, { errors: [{ code: 'mdsp.core.datalake.ObjectNotFoundError', message: 'Either the object not found or you do not have access to perform this operation.' }] });
      }
      const signed = `http://127.0.0.1:${server.address().port}/files/${encodeURIComponent(paths[0])}`;
      return json(201, { objectUrls: [{ path: paths[0], signedUrl: signed }] });
    }
    return json(404, {});
  });
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;

function run(script, args) {
  const env = {
    ...process.env,
    IH_PLATFORM: 'xcelerator',
    XC_TENANT_ID: '1000001700',
    IH_GATEWAY_URL: `http://127.0.0.1:${port}`,
    RECKITT_IAM_TOKEN_URL: `http://127.0.0.1:${port}/oauth/token`,
    RECKITT_API_TECHUSER_CLIENT_ID: 'x',
    RECKITT_API_TECHUSER_CLIENT_SECRET: 'x'
  };
  return new Promise((ok) => {
    execFile('node', [script, ...args], { cwd: root, env }, (err, stdout, stderr) => {
      ok({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

const checks = [];
const check = (name, ok, info = '') => {
  checks.push(ok);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : ''));
};
const clean = () => {
  rmSync(resolve(out, 'mock_test'), { recursive: true, force: true });
  rmSync(resolve(root, 'escaped.txt'), { force: true });
  for (const f of existsSync(out) ? ['x'] : []) {
    void f;
  }
};
clean();
const DL = 'scripts/datalake-download.js';
const UL = 'scripts/datalake-upload.js';

let r = await run(DL, ['list', 'mock_test/fact_loss/']);
check('list: shows 3 files with size', r.code === 0 && /3 file/.test(r.stdout) && /PAR1|\s8\s|\s11\s/.test(r.stdout), r.stdout.trim().split('\n').pop());

r = await run(DL, ['get', PREFIX + '2026-10-12.parquet']);
const f12 = resolve(out, PREFIX + '2026-10-12.parquet');
check('get: file saved with the same bytes', r.code === 0 && existsSync(f12) && readFileSync(f12, 'utf8') === 'PAR1-twelve', r.stdout.trim());
check('signed URL is called without a token', seen.signedAuth.every((a) => a === null));
check('token request used Basic auth', seen.tokenAuth === 'Basic', String(seen.tokenAuth));

r = await run(DL, ['get', 'data/ten=mock/' + PREFIX + '2026-10-11.parquet']);
check('get: the "data/ten=<tenant>/" prefix of the list is removed', r.code === 0 && existsSync(resolve(out, PREFIX + '2026-10-11.parquet')), r.stdout.trim());

r = await run(DL, ['get', PREFIX + '2026-10-13.parquet']);
check('get missing: FAILED with 404, exit 1', r.code === 1 && /not found \(404\)/.test(r.stdout), r.stdout.trim());

seen.batchSizes = [];
r = await run(DL, ['days', PREFIX, '2026-10-10', '2026-10-14']);
check('days: 3 of 5 downloaded, 2 reported as not found', /downloaded 3 of 5 files/.test(r.stdout) && (r.stdout.match(/FAILED/g) || []).length === 2, r.stdout.split('\n')[0]);
check('days: one path per request (5 requests of size 1)', JSON.stringify(seen.batchSizes) === '[1,1,1,1,1]', JSON.stringify(seen.batchSizes));
const zipLine = r.stdout.split('\n').find((l) => l.startsWith('zip:'));
check('days: zip created', Boolean(zipLine) && existsSync(zipLine.slice(5).trim()), zipLine ? 'zip ok' : r.stderr.slice(0, 200));
if (zipLine) {
  rmSync(zipLine.slice(5).trim(), { force: true });
}

// the fake server HAS this object, so only the folder guard of the script can stop the write
store.set('../escaped.txt', Buffer.from('evil'));
r = await run(DL, ['get', '../escaped.txt']);
check('hostile path "../" is refused by the folder guard', !existsSync(resolve(root, 'escaped.txt')) && r.code === 1 && /leaves the downloads folder/.test(r.stdout), r.stdout.trim());

r = await run(DL, ['days']);
check('usage error: exit code 2', r.code === 2, 'exit ' + r.code);

mkdirSync(out, { recursive: true });
const local = resolve(out, '_mock_upload.txt');
writeFileSync(local, 'hello lake');
seen.batchSizes = [];
r = await run(UL, [local, 'mock_test/fact_loss/_upload_test.txt']);
check('upload: PUT done, listed and downloaded back identical', r.code === 0 && /identical to the local file: true/.test(r.stdout) && /HTTP 201/.test(r.stdout), r.stdout.trim().split('\n').pop());
check('upload: stored bytes are the file', store.get('mock_test/fact_loss/_upload_test.txt').toString() === 'hello lake');

r = await run(UL, [local, 'mock_test/fact_loss/_upload_test.txt']);
check('upload: refuses to replace an existing path', r.code === 1 && /REFUSED/.test(r.stdout), r.stdout.trim());

r = await run(UL, [local, 'data/ten=mock/x.txt']);
check('upload: refuses a path with the data/ten= prefix', r.code === 2);

server.close();
clean();
rmSync(local, { force: true });
console.log(checks.every(Boolean) ? '\nALL PASSED' : '\nSOME FAILED');
process.exit(checks.every(Boolean) ? 0 : 1);
