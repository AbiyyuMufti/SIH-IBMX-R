// Offline test of the lake API spike functions (k1, k2) in a VFC-like sandbox.
// Usage: node scripts/test-vfc-lake-spike.js
import vm from 'node:vm';
import { code } from './lib-flow-builder.js';

let failed = 0;
const check = (ok, text) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`);
  if (!ok) failed++;
};
const run = (file, msg) => {
  const node = { status: () => {}, error: () => {}, warn: () => {} };
  const fn = vm.runInNewContext(
    '(function(node,msg,Buffer){' + code(file) + '\n})', {});
  return fn(node, msg, Buffer);
};
const req = (query) => ({ req: { query } });

let r = run('k1-check-request.js', req({ path: 'a/b.parquet' }));
check(r[0] && r[0].path === 'a/b.parquet' && r[0].format === 'bytes', 'ok path, default bytes');
r = run('k1-check-request.js', req({ path: 'a/b.parquet', format: 'base64' }));
check(r[0] && r[0].format === 'base64', 'format base64');
for (const bad of [{}, { path: 'a.csv' }, { path: 'a/../b.parquet' },
  { path: '/a.parquet' }, { path: 'a.parquet', format: 'json' }]) {
  r = run('k1-check-request.js', req(bad));
  check(r[0] === null && r[1].statusCode === 400, `rejects ${JSON.stringify(bad)}`);
}

const file = Buffer.concat([Buffer.from('PAR1'), Buffer.from([1, 2, 3]), Buffer.from('PAR1')]);
r = run('k2-shape-answer.js', { payload: file, format: 'bytes', path: 'x/y.parquet' });
check(Buffer.isBuffer(r.payload) && r.headers['x-parquet-magic'] === 'ok', 'bytes mode');
const serial = JSON.parse(JSON.stringify(file));
r = run('k2-shape-answer.js', { payload: serial, format: 'base64', path: 'x/y.parquet' });
check(Buffer.from(r.payload.data, 'base64').equals(file), 'serialised buffer, base64 round trip');
r = run('k2-shape-answer.js', { payload: 'text', format: 'bytes', path: 'x/y.parquet' });
check(r.statusCode === 500, 'text payload gives 500');
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
