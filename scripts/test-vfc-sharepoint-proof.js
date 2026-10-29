// Offline proof of the VFC request-building and binary pass-through functions.
// Usage: node scripts/test-vfc-sharepoint-proof.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const flow = JSON.parse(readFileSync(
  new URL('../flows/vfc-sharepoint-lake-proof.json', import.meta.url),
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
assert.ok(nodesByType.some((node) => node.ret === 'bin'));
assert.ok(nodesByType.some((node) => node.ret === 'txt'));
assert.ok(flow.some((node) => node.type === 'tab' &&
  node.allowCycles === false));

const settings = nodes.get('1.1 Load proof settings');
settings.func = settings.func
  .replace('PASTE_GRAPH_DRIVE_ID_HERE', 'drive-test')
  .replace('PASTE_SHAREPOINT_FOLDER_PATH_HERE', 'proof')
  .replace('PASTE_SMALL_FILE_NAME_HERE', 'small.txt')
  .replace('PASTE_GRAPH_TOKEN_HERE', 'graph-test-token');

let msg = run('1.1 Load proof settings', {});
msg = run('1.2 Build lake token request', msg);
assert.equal(msg.method, 'POST');
assert.equal(msg.url, cfg.tokenUrl);
assert.match(msg.headers.Authorization, /^Basic /);

msg = response(msg, 200, {
  access_token: 'lake-test-token',
  expires_in: 1799
});
msg = run('1.3 Check lake token', msg);
msg = run('1.4 Build Graph folder request', msg);
assert.equal(msg.method, 'GET');
assert.match(msg.url, /drives\/drive-test\/root:\/proof:\/children/);
assert.equal(msg.headers.Authorization, 'Bearer graph-test-token');

msg = response(msg, 200, {
  value: [
    {
      id: 'item-test',
      name: 'small.txt',
      size: 4,
      file: {}
    }
  ]
});
msg = run('1.5 Pick test file', msg);
assert.match(msg.url, /items\/item-test\/content$/);

msg = response(msg, 200, Buffer.from('tiny'));
msg = run('1.6 Prepare lake upload URL', msg);
assert.equal(msg.method, 'POST');
assert.equal(msg.url, msg.lakeBase + '/generateUploadObjectUrls');
assert.equal(
  JSON.stringify(msg.payload),
  '{"paths":[{"path":"sharepoint-proof/small.txt"}]}'
);
assert.equal(msg.headers.Authorization, 'Bearer lake-test-token');
assert.deepEqual(msg.fileBytes, Buffer.from('tiny'));

msg = JSON.parse(JSON.stringify(msg));
msg = response(msg, 201, {
  objectUrls: [
    { signedUrl: 'https://signed.example/hidden-signature' }
  ]
});
msg = run('1.7 Prepare signed PUT', msg);
assert.equal(msg.method, 'PUT');
assert.equal(msg.url, 'https://signed.example/hidden-signature');
assert.equal(Object.keys(msg.headers).length, 0);
assert.deepEqual(msg.payload, Buffer.from('tiny'));
assert.equal(msg.headers.Authorization, undefined);

msg = response(msg, 200, '');
msg = run('1.8 Report upload', msg);
assert.equal(
  msg.payload,
  'UPLOADED small.txt (4 bytes) to sharepoint-proof/small.txt'
);
assert.equal(JSON.stringify(msg).includes('graph-test-token'), false);
assert.equal(JSON.stringify(msg).includes('lake-test-token'), false);
assert.equal(JSON.stringify(msg).includes('hidden-signature'), false);
console.log('PASS: request shapes, binary payload, safe PUT headers and log');
