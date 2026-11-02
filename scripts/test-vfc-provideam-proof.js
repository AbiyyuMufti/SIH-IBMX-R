// Offline proof of the VFC Provideam proof functions.
// Usage: node scripts/test-vfc-provideam-proof.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const flow = JSON.parse(readFileSync(
  new URL('../flows/vfc-provideam-lake-proof.json', import.meta.url),
  'utf8'
));
const nodes = new Map(flow.map((node) => [node.name, node]));
const statuses = [];
const errors = [];
const context = { get: () => undefined, set: () => {} };

function run(name, msg) {
  const node = nodes.get(name);
  assert.ok(node, `missing function node: ${name}`);
  const mockNode = {
    status: (value) => statuses.push(value.text),
    error: (value) => errors.push(value),
    warn: () => {}
  };
  const fn = vm.runInNewContext(
    '(function(flow,node,msg,Buffer,Promise,glob){' + node.func + '\n})',
    {}
  );
  return fn(context, mockNode, msg, Buffer, Promise, context);
}

assert.ok(flow.some((node) => node.type === 'tab' &&
  node.allowCycles === false));
assert.equal(flow.some((node) => /lake/i.test(node.name || '')), false);

// Without the key the settings node stops with a clear reason.
assert.equal(run('1.1 Load proof settings', {}), null);
assert.deepEqual(errors.splice(0), ['Fill in PROVIDEAM_API_KEY']);

const settings = nodes.get('1.1 Load proof settings');
settings.func = settings.func
  .replace('PASTE_PROVIDEAM_API_KEY_HERE', 'provideam-test-key')
  .replace("var DAY = '';", "var DAY = '2026-10-29';");

// The built-in body must equal saved report 23 (period included).
const sample = readFileSync(new URL(
  '../docs/provideam-samples/23-new-plan-opt-report.md', import.meta.url
), 'utf8');
const saved = JSON.parse(sample.split('```json')[1].split('```')[0]);

let msg = run('1.1 Load proof settings', {});
msg = run('1.2 Build Provideam request', msg);
assert.equal(errors.length, 0, errors.join('; '));
assert.equal(msg.method, 'POST');
assert.equal(msg.url,
  'https://rb-api.provideam.com/api/v1/Report/ObjectByPeriod');
assert.equal(msg.headers.apiKey, 'provideam-test-key');
assert.equal(msg.headers['Content-Type'], 'application/json-patch+json');
assert.deepEqual(JSON.parse(msg.payload), saved);

msg.statusCode = 200;
msg.payload = '{"processedData":[{"rowDesc":"Row_0","fnGoodParts_0":5}]}';
msg = run('1.3 Check Provideam rows', msg);
assert.equal(errors.length, 0, errors.join('; '));
assert.deepEqual(JSON.parse(JSON.stringify(msg.payload)), {
  report: 'New Plan OPT Report',
  day: '2026-10-29',
  rowCount: 1,
  rows: [{ rowDesc: 'Row_0', fnGoodParts_0: 5 }]
});
assert.equal(JSON.stringify(msg).includes('provideam-test-key'), false);

// A failed call goes to the catch lane with a safe message.
msg = run('1.3 Check Provideam rows', {
  statusCode: 500,
  payload: '',
  proofFile: { name: 'New Plan OPT Report 2026-10-29' },
  _proofStage: 'Provideam report',
  headers: { apiKey: 'provideam-test-key' }
});
assert.equal(msg, null);
assert.deepEqual(errors.splice(0), ['Provideam HTTP 500']);
const failed = run('2.1 Report safe failure', {
  proofFailureReason: 'Provideam HTTP 500',
  proofFile: { name: 'New Plan OPT Report 2026-10-29' },
  _proofStage: 'Provideam report',
  headers: { apiKey: 'provideam-test-key' }
});
assert.equal(failed.payload, 'FAILED Provideam report ' +
  'New Plan OPT Report 2026-10-29: Provideam HTTP 500');
assert.equal(JSON.stringify(failed).includes('provideam-test-key'), false);
console.log('PASS: report 23 body built in, rows shown, safe failure');
