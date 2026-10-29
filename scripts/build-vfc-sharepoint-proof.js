// Builds a one-file SharePoint-to-lake proof flow.
// Usage: node scripts/build-vfc-sharepoint-proof.js
// Function code: scripts/vfc/s*-proof-*.js. Do not edit the JSON by hand.
import { mkdirSync, writeFileSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  code, compactLanes, debugStep, fn, http, makeBuilder, rawStep
} from './lib-flow-builder.js';

function buildFlow() {
  const b = makeBuilder(31);
  const flow = 'SharePoint lake proof';

  b.lane(1, 'ONE-FILE SHAREPOINT TO LAKE PROOF',
    'STAGE 1 - manually choose one small direct-child SharePoint file. The ' +
    'flow downloads it to memory, requests a lake signed URL, then PUTs the ' +
    'bytes without a Bearer token. Run the existing Config tab first with ' +
    'xcelerator selected. This is a one-shot proof; it does not recurse, ' +
    'follow Graph pages, schedule, or renew the pasted Graph token.',
    [
      rawStep('run', {
        type: 'inject',
        name: 'Run one-file proof',
        topic: '',
        payload: '',
        payloadType: 'date',
        repeat: '',
        repeatEnd: '0',
        endTime: '0',
        crontab: '',
        offset: 'NaN',
        once: false,
        properties: '',
        timezone: 'UTC',
        betweentimesunit: 'm',
        showNextExecution: false,
        powerMode: false
      }),
      fn('settings', 'Load proof settings', 's1-proof-settings.js', ['next']),
      fn('tokenRequest', 'Build lake token request',
        's2-proof-token-request.js', ['next']),
      http('tokenHttp', 'POST lake token'),
      fn('tokenCheck', 'Check lake token',
        's3-proof-token-check.js', ['next']),
      fn('listRequest', 'Build Graph folder request',
        's4-proof-list-request.js', ['next']),
      http('listHttp', 'GET Graph folder'),
      fn('pickFile', 'Pick test file', 's5-proof-pick-file.js', ['next']),
      rawStep('downloadHttp', {
        type: 'http request',
        name: 'Download file bytes',
        method: 'use',
        ret: 'bin',
        url: '',
        timeout: '',
        mindspherePath: '',
        useMindsphereAuth: false,
        isAdmin: false
      }),
      fn('lakeUrl', 'Prepare lake upload URL',
        's6-proof-lake-url-request.js', ['next']),
      http('lakeUrlHttp', 'POST upload URL'),
      fn('putRequest', 'Prepare signed PUT',
        's7-proof-put-request.js', ['next']),
      rawStep('putHttp', {
        type: 'http request',
        name: 'PUT signed URL',
        method: 'use',
        ret: 'txt',
        url: '',
        timeout: '',
        mindspherePath: '',
        useMindsphereAuth: false,
        isAdmin: false
      }),
      fn('uploadResult', 'Report upload',
        's8-proof-upload-result.js', ['next']),
      debugStep('successDebug', 'Proof result', 'payload')
    ]);

  b.lane(2, 'SAFE FAILURE',
    'STAGE 2 - catch failures and report only a short sanitized reason. ' +
    'Tokens and signed URLs are not included.',
    [
      rawStep('catch', {
        type: 'catch',
        name: 'Catch proof failures',
        scope: null,
        uncaught: false
      }),
      fn('failure', 'Report safe failure',
        's9-proof-failure.js', ['next']),
      debugStep('failureDebug', 'Proof failure', 'payload')
    ]);

  b.nodes.unshift({
    id: b.TAB,
    type: 'tab',
    label: flow,
    disabled: false,
    allowCycles: false,
    info: 'Manual one-file proof of SharePoint binary download and lake upload.'
  });
  compactLanes(b.nodes);
  return b.nodes;
}

mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
const nodes = buildFlow();
const { errors, warnings, stats } = validateFlow(nodes);
if (errors.length) {
  throw new Error(`flow check failed:\n  ${errors.join('\n  ')}`);
}
writeFileSync(
  new URL('../flows/vfc-sharepoint-lake-proof.json', import.meta.url),
  JSON.stringify(nodes, null, 2) + '\n'
);
console.log(
  `written flows/vfc-sharepoint-lake-proof.json: ${stats.nodes} nodes, ` +
  `longest line ${stats.longestLine}`
);
warnings.forEach((warning) => console.log(`warn: ${warning}`));
