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
const cfg = {
  platform: 'xcelerator',
  xcTenantId: '1234567890',
  tokenUrl: 'https://tenant.example/oauth/token',
  tokenForm: true,
  clientId: 'test-client',
  clientSecret: 'test-secret'
};
const statuses = [];
const errors = [];
const context = {
  get: (key) => key === 'cfg' ? cfg : undefined,
  set: () => {}
};

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
  const result = fn(context, mockNode, msg, Buffer, Promise, context);
  assert.equal(errors.length, 0, errors.join('; '));
  return result;
}

function response(msg, statusCode, payload) {
  msg.statusCode = statusCode;
  msg.payload = payload;
  return msg;
}

const nodesByType = flow.filter((node) => node.type === 'http request');
assert.ok(nodesByType.some((node) => node.ret === 'txt'));
assert.ok(flow.some((node) => node.type === 'tab' &&
  node.allowCycles === false));

const reportBody = {
  userId: 1,
  objects: [{ objectParam: { obMachineID: ['1'] } }],
  fields: [{ fieldName: 'fdYYYYMMDD' }],
  functions: [{ funcName: 'fnGoodParts', index: 1 }],
  periods: [{ periodParam: { pdDay: ['[Select a day]'] } }]
};
const settings = nodes.get('1.1 Load proof settings');
settings.func = settings.func
  .replace('PASTE_PROVIDEAM_API_KEY_HERE', 'provideam-test-key')
  .replace("'PASTE_REPORT_BODY_JSON_HERE'",
    JSON.stringify(JSON.stringify(reportBody)).replace(/^"|"$/g, "'"))
  .replace("var DAY = '';", "var DAY = '2026-10-29';");

let msg = run('1.1 Load proof settings', {});
msg = run('1.2 Build Provideam request', msg);
assert.equal(msg.method, 'POST');
assert.equal(msg.url, 'https://rb-api.provideam.com/api/v1/Report/ObjectByPeriod');
assert.equal(msg.headers.apiKey, 'provideam-test-key');
assert.equal(msg.headers['Content-Type'], 'application/json-patch+json');
const sent = JSON.parse(msg.payload);
assert.deepEqual(sent.periods[0].periodParam.pdDay, ['[2026-10-29T00:00:00]']);
assert.deepEqual(sent.fields, reportBody.fields);

const raw = '{"processedData":[{"rowDesc":"Row_0","fnGoodParts_0":5}]}';
msg = response(msg, 200, raw);
msg = run('1.3 Check Provideam rows', msg);
assert.equal(msg.rowCount, 1);
assert.equal(msg.fileBytes.toString('utf8'), raw);

msg = run('1.4 Build lake token request', msg);
assert.equal(msg.url, cfg.tokenUrl);
msg = response(msg, 200, { access_token: 'lake-test-token' });
msg = run('1.5 Check lake token', msg);
msg = run('1.6 Prepare lake upload URL', msg);
assert.equal(
  JSON.stringify(msg.payload),
  '{"paths":[{"path":"mufti_test/provideam/new-plan-opt-report_2026-10-29.json"}]}'
);
assert.equal(msg.headers.Authorization, 'Bearer lake-test-token');

msg = JSON.parse(JSON.stringify(msg));
msg = response(msg, 201, {
  objectUrls: [{ signedUrl: 'https://signed.example/hidden-signature' }]
});
msg = run('1.7 Prepare signed PUT', msg);
assert.equal(msg.method, 'PUT');
assert.equal(msg.payload.toString('utf8'), raw);
assert.equal(Object.keys(msg.headers).length, 0);

msg = response(msg, 200, '');
msg = run('1.8 Report upload', msg);
assert.equal(msg.payload, 'UPLOADED new-plan-opt-report_2026-10-29.json ' +
  '(1 rows, 57 bytes) to mufti_test/provideam/' +
  'new-plan-opt-report_2026-10-29.json');
for (const secret of ['provideam-test-key', 'lake-test-token', 'hidden-signature']) {
  assert.equal(JSON.stringify(msg).includes(secret), false, secret);
}
console.log('PASS: Provideam request, raw text kept, lake path, safe log');
