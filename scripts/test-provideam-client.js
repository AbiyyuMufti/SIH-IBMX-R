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
assert.ok(ALLOWED_REQUESTS.has('POST /api/v1/report/objectbyperiod'));
assert.equal(
  [...ALLOWED_REQUESTS].some((entry) =>
    /account|operator|contactlist|services\/(start|stop)|setpart|setmachine|updatemachine/i.test(entry),
  ),
  false,
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
