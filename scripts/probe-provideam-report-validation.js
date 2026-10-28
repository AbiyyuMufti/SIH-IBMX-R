import { request, saveSample } from './provideam-client.js';

const method = 'POST';
const path = '/api/v1/report/objectbyperiod';
const body = {};
const response = await request(method, path, { body });

await saveSample('objectbyperiod-empty-request', {
  request: { method, path, body },
  response,
});
console.log(`Object By Period validation probe: HTTP ${response.status}`);
