// Tests scripts/datalake-download.js against a fake server on localhost (no network, no real credentials).
// The fake server answers: token, generateDownloadObjectUrls and the signed file URLs.
// Scenarios: files that exist, one that is missing (not returned), one hostile path ("../").
// Usage: node scripts/test-datalake-mock.js
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'downloads');
const PREFIX = 'mock_test/fact_kpi/Hull/fact_kpi_';
const exists = new Set([PREFIX + '2026-09-01.parquet', PREFIX + '2026-09-02.parquet', PREFIX + '2026-09-04.parquet']);
const seen = { generate: 0, batches: [], tokenAuth: null, hostile: false };

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url.startsWith('/oauth/token')) {
      seen.tokenAuth = String(req.headers.authorization || '').split(' ')[0];
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ access_token: 'fake', token_type: 'bearer', expires_in: 1799 }));
    } else if (req.url === '/api/datalake/v3/generateDownloadObjectUrls') {
      seen.generate++;
      const paths = JSON.parse(body).paths.map((p) => p.path);
      seen.batches.push(paths.length);
      // the real answer for a missing file is unknown: this fake leaves it out
      const urls = paths.filter((p) => exists.has(p)).map((p) => ({ path: p, signedUrl: `http://127.0.0.1:${server.address().port}/files/${p}` }));
      if (seen.hostile) {
        urls.push({ path: '../escaped.txt', signedUrl: `http://127.0.0.1:${server.address().port}/files/x` });
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ objectUrls: urls }));
    } else if (req.url.startsWith('/files/')) {
      res.end('PAR1-' + req.url);
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;

function run(args, extraEnv = {}) {
  const env = {
    ...process.env,
    IH_GATEWAY_URL: `http://127.0.0.1:${port}`,
    RECKITT_IAM_TOKEN_URL: `http://127.0.0.1:${port}/oauth/token`,
    IH_PLATFORM: 'legacy',
    RECKITT_API_TECHUSER_CLIENT_ID: 'x',
    RECKITT_API_TECHUSER_CLIENT_SECRET: 'x',
    ...extraEnv
  };
  return new Promise((ok) => {
    import('node:child_process').then(({ execFile }) => {
      execFile('node', ['scripts/datalake-download.js', ...args], { cwd: root, env }, (err, stdout, stderr) => {
        ok({ code: err ? err.code : 0, stdout, stderr });
      });
    });
  });
}

const checks = [];
const check = (name, ok, info = '') => {
  checks.push(ok);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : ''));
};

rmSync(resolve(out, 'mock_test'), { recursive: true, force: true });
rmSync(resolve(out, 'escaped.txt'), { force: true });
rmSync(resolve(root, 'escaped.txt'), { force: true });

// 1 probe on a file that exists
let r = await run(['probe', PREFIX + '2026-09-01.parquet']);
check('probe exists: exit 0, prints status and field names', r.code === 0 && /HTTP 200/.test(r.stdout) && /objectUrls/.test(r.stdout), r.stdout.trim().split('\n').join(' | '));
check('probe never prints a signed URL or token', !/127\.0\.0\.1|fake/.test(r.stdout + r.stderr));
check('token request used Basic auth', seen.tokenAuth === 'Basic', String(seen.tokenAuth));

// 2 probe on a missing file
r = await run(['probe', PREFIX + '2026-09-03.parquet']);
check('probe missing: handled, no crash', r.code === 0 || r.code === 1, 'exit ' + r.code + ' | ' + r.stdout.trim().split('\n').join(' | '));

// 3 days: 01..05, files 01, 02, 04 exist
r = await run(['days', PREFIX, '2026-09-01', '2026-09-05']);
const files = ['01', '02', '04'].map((d) => resolve(out, PREFIX + `2026-09-${d}.parquet`));
check('days: three existing files saved', files.every((f) => existsSync(f)));
check('days: summary says 3 of 5', /downloaded 3 of 5 files/.test(r.stdout), r.stdout.split('\n')[0]);
check('days: the 2 missing days are reported as FAILED', (r.stdout.match(/FAILED/g) || []).length === 2, r.stdout.split('\n').filter((l) => /FAILED/.test(l)).join(' | '));
check('days: file content is the download, not the URL list', readFileSync(files[0], 'utf8').startsWith('PAR1-'));
const zip = r.stdout.split('\n').find((l) => l.startsWith('zip:'));
check('days: zip created', !!zip && existsSync(zip.slice(5).trim()) && statSync(zip.slice(5).trim()).size > 50, zip || r.stderr.slice(0, 200));
if (zip && process.platform === 'win32') {
  const list = execFileSync(resolve(process.env.SystemRoot, 'System32', 'tar.exe'), ['-tf', zip.slice(5).trim()]).toString();
  check('zip lists the three files with their folders', ['01', '02', '04'].every((d) => list.includes(`fact_kpi_2026-09-${d}.parquet`)) && !list.includes('09-03'), list.trim().split('\n').join(' | '));
}

// 4 batching: 120 days must be split into batches of at most 50
seen.batches = [];
r = await run(['days', PREFIX, '2026-01-01', '2026-04-30']);
check('batching: 120 days -> 3 requests of 50, 50, 20', JSON.stringify(seen.batches) === '[50,50,20]', JSON.stringify(seen.batches));

// 5 hostile path from the server must not write outside downloads/
seen.hostile = true;
r = await run(['days', PREFIX, '2026-09-01', '2026-09-01']);
seen.hostile = false;
check('hostile path "../" is refused', !existsSync(resolve(root, 'escaped.txt')) && /leaves the downloads folder/.test(r.stdout), r.stdout.split('\n').filter((l) => /FAILED/.test(l)).join(' | '));

// 6 wrong usage
r = await run(['days']);
check('usage error: exit code 2', r.code === 2, 'exit ' + r.code);

server.close();
rmSync(resolve(out, 'mock_test'), { recursive: true, force: true });
rmSync(resolve(out, 'escaped.txt'), { force: true });
console.log(checks.every(Boolean) ? '\nALL PASSED' : '\nSOME FAILED');
process.exit(checks.every(Boolean) ? 0 : 1);
