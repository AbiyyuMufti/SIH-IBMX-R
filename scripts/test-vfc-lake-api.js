// Offline test of the lake API functions (k4 to k7) in a VFC-like sandbox,
// chained like the flow: check -> list result -> decide -> shape -> log.
// Usage: node scripts/test-vfc-lake-api.js
import vm from 'node:vm';
import { code } from './lib-flow-builder.js';

let failed = 0;
const check = (ok, text) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`);
  if (!ok) failed++;
};
const flowData = {};
const flow = { get: (k) => flowData[k], set: (k, v) => { flowData[k] = v; } };
const glob = { get: () => ({ root: 'reports' }) };
const run = (file, msg) => {
  const node = { status: () => {}, error: () => {}, warn: () => {} };
  const fn = vm.runInNewContext(
    '(function(flow,glob,node,msg,Buffer){' + code(file) + '\n})', {});
  return fn(flow, glob, node, msg, Buffer);
};
const req = (query) => ({ req: { query } });
const DIR = 'reports/fact_kpi/site=Hull/';
const FILE = DIR + 'fact_kpi_2026-09-30.parquet';
const listing = [
  { key: DIR + 'fact_kpi_2026-09-29.parquet', lastModified: 'x', contentSize: 10 },
  { key: FILE, lastModified: 'y', contentSize: 12 }
];

let r = run('k4-check-request.js', req({ path: FILE }));
check(r[0].mode === 'file' && r[0].folder === DIR && r[0].path === DIR, 'file request');
check(flowData.cfg && flowData.cfg.root === 'reports', 'log root set');
r = run('k4-check-request.js', req({ list: DIR }));
check(r[0].mode === 'list' && r[0].folder === DIR, 'list request');
for (const bad of [{}, { path: 'a.csv' }, { path: 'a/../b.parquet' },
  { path: '/a.parquet' }, { list: 'reports/x' },
  { path: FILE, list: DIR }]) {
  r = run('k4-check-request.js', req(bad));
  check(r[0] === null && r[1].statusCode === 400, `400 for ${JSON.stringify(bad)}`);
}

const fileMsg = run('k4-check-request.js', req({ path: FILE }))[0];
r = run('k5-decide.js', { ...fileMsg, payload: listing });
check(r[0] && r[0].path === FILE && r[0].size === 12 && r[1] === null, 'file found, goes to read');
const missing = run('k4-check-request.js', req({ path: DIR + 'fact_kpi_2026-09-04.parquet' }))[0];
r = run('k5-decide.js', { ...missing, payload: listing });
check(r[0] === null && r[1].statusCode === 404, 'missing file gives 404');
check(r[1].payload.listed_in_folder === 2, '404 shows the listed count');
r = run('k5-decide.js', { ...missing, payload: undefined });
check(r[1].statusCode === 404, 'empty list result gives 404');
const listMsg = run('k4-check-request.js', req({ list: DIR }))[0];
r = run('k5-decide.js', { ...listMsg, payload: listing });
check(r[1].statusCode === 200 && r[1].payload.count === 2, 'list answer');
check(r[1].payload.objects[1].size === 12, 'list shows size');

const file = Buffer.concat([Buffer.from('PAR1'), Buffer.from([1, 2]), Buffer.from('PAR1')]);
const found = r = run('k5-decide.js', { ...fileMsg, payload: listing })[0];
let a = run('k6-shape-file.js', { ...found, payload: file });
check(a.statusCode === 200 && Buffer.isBuffer(a.payload), 'bytes answer');
a = run('k6-shape-file.js', { ...found, payload: JSON.parse(JSON.stringify(file)) });
check(a.statusCode === 200 && a.size === file.length, 'serialised buffer answer');
a = run('k6-shape-file.js', { ...found, payload: Buffer.from('hello') });
check(a.statusCode === 502, 'not parquet gives 502');
a = run('k6-shape-file.js', { ...found, payload: undefined });
check(a.statusCode === 502, 'no bytes gives 502');

const ok = run('k6-shape-file.js', { ...found, ...req({ path: FILE, key: 'SECRET' }), payload: file });
const l = run('k7-log-request.js', ok);
check(l[1].level === 'info' && /200/.test(l[1].payload), 'log line ok');
check(!/SECRET/.test(l[1].payload), 'log never has the key');
const l404 = run('k7-log-request.js', { ...req({ path: FILE }), statusCode: 404 });
check(l404[1].level === 'warn', '404 is a warn');
const l502 = run('k7-log-request.js', { ...req({ path: FILE }), statusCode: 502 });
check(l502[1].level === 'failed', '502 is failed');
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
