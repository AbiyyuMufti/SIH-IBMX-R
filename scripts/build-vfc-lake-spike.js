// Builds the importable VFC test flow flows/vfc-lake-api-spike.json.
// Lane 1: http in -> check -> read object -> shape -> http response, to see
//   if the VFC can send a parquet file as bytes or as base64 text.
// Lane 2: list objects test, to see what the node returns (for a later
//   "does the file exist" check). Usage: node scripts/build-vfc-lake-spike.js
// Function code: scripts/vfc/k*.js. Do not edit the JSON by hand.
import { writeFileSync, mkdirSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import { code, makeBuilder } from './lib-flow-builder.js';

const ENDPOINT = '/parquet-data-lake-spike';

function buildFlow() {
  const b = makeBuilder(9);
  const { add, id, col, rowY, comment } = b;
  const r1 = 1;
  const r2 = 2;
  const y1 = rowY(r1);
  const y2 = rowY(r2);

  comment(
    '[1] LAKE API SPIKE',
    `STAGE 1 - GET ${ENDPOINT}?path=<file>.parquet&format=bytes|base64. Set the access key on the http in node after the import (generate it there, never in the repo). 1.1 accepts only .parquet paths without .. and answers 400 otherwise. The read node sends nothing when the file does not exist, so a missing file makes the request hang: that is expected in this test. 1.2 sends the file as bytes (default) or as base64 text in JSON. Header x-parquet-magic tells if the file starts with PAR1.`,
    r1
  );
  add({
    id: id('in'), type: 'http in', name: 'Get parquet (spike)',
    endpoint: ENDPOINT, method: 'get', upload: false, access: 'key',
    key: '', users: '', powerMode: false, x: col(0), y: y1,
    wires: [[id('check')]]
  });
  add({
    id: id('check'), type: 'function', name: '1.1 Check request',
    func: code('k1-check-request.js'), outputs: 2, language: 'javascript',
    noerr: 0, x: col(1), y: y1,
    wires: [[id('read')], [id('answerBad')]]
  });
  add({
    id: id('read'), type: 'read object', name: 'Read parquet file',
    path: '', mode: 'object', x: col(2), y: y1, wires: [[id('shape')]]
  });
  add({
    id: id('shape'), type: 'function', name: '1.2 Shape answer',
    func: code('k2-shape-answer.js'), outputs: 1, language: 'javascript',
    noerr: 0, x: col(3), y: y1, wires: [[id('answerOk')]]
  });
  add({
    id: id('answerOk'), type: 'http response', name: 'Send answer',
    statusCode: '', headers: {}, x: col(4), y: y1, wires: []
  });
  add({
    id: id('answerBad'), type: 'http response', name: 'Send error answer',
    statusCode: '', headers: {}, x: col(2), y: y1 + 100, wires: []
  });

  comment(
    '[2] LIST OBJECTS TEST',
    'STAGE 2 - click the inject button with {"path":"<folder in the lake>"} and read the debug sidebar: it shows what the list objects node returns. If it lists nothing, also type the folder into the path field of the list objects node. This shows how a later flow can check that a file exists before it reads it.',
    r2
  );
  add({
    id: b.newId(), type: 'inject', name: 'List folder (edit payload)',
    topic: '', repeat: '', repeatEnd: '0', endTime: '0', offset: 'NaN',
    once: false, properties: '', timezone: 'UTC', betweentimesunit: 'm',
    showNextExecution: false, powerMode: false,
    payload: '{"path":"reports/fact_kpi"}', payloadType: 'json', crontab: '',
    x: col(0), y: y2, wires: [[id('listPath')]]
  });
  add({
    id: id('listPath'), type: 'function', name: '2.1 Set list path',
    func: code('k3-list-path.js'), outputs: 1, language: 'javascript',
    noerr: 0, x: col(1), y: y2, wires: [[id('list')]]
  });
  add({
    id: id('list'), type: 'list objects', name: 'List objects',
    subtenant: '', path: '', x: col(2), y: y2, wires: [[id('listDebug')]]
  });
  add({
    id: id('listDebug'), type: 'debug', name: 'Show list result',
    active: true, tosidebar: true, console: false, tostatus: false,
    complete: 'true', targetType: 'full', x: col(3), y: y2, wires: []
  });

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'Lake API spike',
    disabled: false, allowCycles: false,
    info: 'Test: can Python download a parquet file from the data lake through an http in endpoint of the VFC, as bytes or as base64 text? Also shows what list objects returns.'
  });
  return b.nodes;
}

mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
const nodes = buildFlow();
const { errors, warnings, stats } = validateFlow(nodes);
if (errors.length) {
  throw new Error(`flow check failed:\n  ${errors.join('\n  ')}`);
}
writeFileSync(new URL('../flows/vfc-lake-api-spike.json', import.meta.url),
  JSON.stringify(nodes, null, 2) + '\n');
console.log(
  `written flows/vfc-lake-api-spike.json: ${stats.nodes} nodes, longest line ${stats.longestLine}`
);
warnings.forEach((w) => console.log(`warn: ${w}`));
