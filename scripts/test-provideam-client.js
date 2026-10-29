import assert from 'node:assert/strict';
import {
  ALLOWED_REQUESTS,
  redactSensitive,
  request,
} from './provideam-client.js';

const forbiddenRequests = [
  ['POST', '/api/v1/account/login'],
  ['POST', '/api/v1/account/refresh'],
  ['POST', '/api/v1/area/setpart'],
  ['POST', '/api/v1/machine/setmachinesettings'],
  ['POST', '/api/v1/machine/setmachinepartstdtime'],
  ['POST', '/api/v1/machine/setmachineschdowntime'],
  ['POST', '/api/v1/machine/updatemachinecurrentvalues'],
  ['POST', '/api/v1/services/start'],
  ['POST', '/api/v1/services/stop'],
  ['GET', '/api/v1/area/getoperators'],
  ['GET', '/api/v1/contactlist/get'],
];

for (const [method, path] of forbiddenRequests) {
  await assert.rejects(
    request(method, path, { body: {} }),
    /not allowlisted/,
  );
}

await assert.rejects(
  request('GET', '/api/v1/report/objectbyperiod'),
  /not allowlisted/,
);
await assert.rejects(
  request('POST', '/api/v1/report/not-a-real-endpoint', { body: {} }),
  /not allowlisted/,
);

assert.ok(ALLOWED_REQUESTS.has('GET /api/v1/plant/getall'));
assert.ok(ALLOWED_REQUESTS.has('POST /api/v1/Report/ObjectByPeriod'));
assert.ok(ALLOWED_REQUESTS.has('POST /api/v1/report/objectbyperiod'));
assert.equal(
  [...ALLOWED_REQUESTS].some((entry) =>
    /account|operator|contactlist|services\/(start|stop)|setpart|setmachine|updatemachine/i.test(entry),
  ),
  false,
);

await assert.rejects(
  request('POST', '/api/v1/report/objectbyperiod', {
    body: {},
    contentType: 'text/plain',
  }),
  /content type is not allowlisted/,
);

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.PROVIDEAM_API_KEY;
let capturedRequest;
process.env.PROVIDEAM_API_KEY = 'offline-test-key';
globalThis.fetch = async (url, options) => {
  capturedRequest = { url: String(url), options };
  return {
    status: 500,
    ok: false,
    text: async () => '{"error":"offline test"}',
  };
};
try {
  await request('POST', '/api/v1/report/objectbyperiod', {
    body: { probe: true },
    contentType: 'application/json-patch+json',
  });
} finally {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.PROVIDEAM_API_KEY;
  } else {
    process.env.PROVIDEAM_API_KEY = originalApiKey;
  }
}
assert.equal(
  capturedRequest.options.headers['Content-Type'],
  'application/json-patch+json',
);
assert.equal(
  capturedRequest.options.body,
  JSON.stringify({ probe: true }),
);

assert.deepEqual(
  redactSensitive({
    apiKey: 'redact-me',
    nested: {
      password: 'redact-me',
      refreshToken: 'redact-me',
      salt: 'redact-me',
      operatorName: 'sample-person',
      machineName: 'sample',
      id: 1,
    },
  }),
  {
    nested: {
      machineName: 'sample',
      id: 1,
    },
  },
);

console.log('Provideam client allowlist and redaction checks passed.');
