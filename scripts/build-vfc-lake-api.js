// Builds the importable VFC flow flows/vfc-lake-api.json.
// Python calls GET <endpoint>?path=<file>.parquet and gets the file (bytes),
// or ?list=<folder>/ and gets the files of the folder as JSON. A missing file
// gives 404 at once (list objects first). One log line per request.
// Usage: node scripts/build-vfc-lake-api.js
// Function code: scripts/vfc/k4-k7*.js. Do not edit the JSON by hand.
import { writeFileSync, mkdirSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  fn, linkInStep, end, readStep, rawStep, addLogLanes, makeBuilder
} from './lib-flow-builder.js';

const ENDPOINT = '/parquet-data-lake';
const FLOW_NAME = 'lake-api';

function buildFlow() {
  const b = makeBuilder(10);
  let r = 1;
  b.lane(r++, 'REQUEST',
    `GET ${ENDPOINT}?path=<file>.parquet returns the file as bytes. GET ${ENDPOINT}?list=<folder>/ returns the files of the folder as JSON (key, last_modified, size). The key of the endpoint is the access key of the http in node: generate it there after the import, it is not part of this file. 1 checks the request (only .parquet files, no .., a folder ends with /) and answers 400 otherwise. The list objects node lists the folder, 2 looks for the file in the list: not there = answer 404 at once, nothing is read. 3 sends the bytes with the header x-parquet-magic. If the lake gives something that is not parquet, the answer is 502. Delete or disable any other http in node with the same endpoint before you deploy.`,
    [
      rawStep('in', {
        type: 'http in', name: 'Get parquet', endpoint: ENDPOINT,
        method: 'get', upload: false, access: 'key', key: '', users: '',
        powerMode: false
      }),
      fn('check', 'Check request', 'k4-check-request.js', ['next', 'ANSWER']),
      rawStep('list', {
        type: 'list objects', name: 'List folder', subtenant: '', path: ''
      }),
      fn('decide', 'Decide', 'k5-decide.js', ['next', 'ANSWER']),
      readStep('read', 'Read parquet file'),
      fn('shape', 'Shape file answer', 'k6-shape-file.js', ['next']),
      end('ANSWER')
    ]);
  b.lane(r++, 'ANSWER',
    'every answer arrives here through the link "to ANSWER": the file, the folder list or an error. 1 adds one log line (path, status, size) and sends the answer to the http response node. The log goes to the shared log lanes below, file reports/logs/lake-api/log_YYYY-MM.csv.',
    [
      linkInStep('ANSWER'),
      fn('logReq', 'Log request', 'k7-log-request.js', ['next', 'LOG']),
      rawStep('out', {
        type: 'http response', name: 'Send answer', statusCode: '',
        headers: {}
      })
    ]);
  addLogLanes(b, r, FLOW_NAME);

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'Lake API',
    disabled: false, allowCycles: false,
    info: 'Python reads parquet files of the data lake through an http in endpoint. Needs the Config tab (root folder). Generate the access key on the http in node after the import.'
  });
  return b.nodes;
}

mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
const nodes = buildFlow();
const { errors, warnings, stats } = validateFlow(nodes);
if (errors.length) {
  throw new Error(`flow check failed:\n  ${errors.join('\n  ')}`);
}
writeFileSync(new URL('../flows/vfc-lake-api.json', import.meta.url),
  JSON.stringify(nodes, null, 2) + '\n');
console.log(
  `written flows/vfc-lake-api.json: ${stats.nodes} nodes, ${stats.linkIn} link in / ` +
    `${stats.linkOut} link out, longest line ${stats.longestLine}`
);
warnings.forEach((w) => console.log(`warn: ${w}`));
