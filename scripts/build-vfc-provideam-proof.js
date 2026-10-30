// Builds a one-report Provideam-to-lake proof flow.
// Usage: node scripts/build-vfc-provideam-proof.js
// Function code: scripts/vfc/s*-proof-*.js. Do not edit the JSON by hand.
import { mkdirSync, writeFileSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  code, compactLanes, debugStep, fn, http, makeBuilder, rawStep
} from './lib-flow-builder.js';

function buildFlow() {
  const b = makeBuilder(31);
  const flow = 'Provideam lake proof';

  b.lane(1, 'ONE-REPORT PROVIDEAM TO LAKE PROOF',
    'STAGE 1 - call one Provideam report for one day (the pasted saved ' +
    'body, period replaced) and store the response text as it came in the ' +
    'lake under mufti_test/provideam. Run the Config tab first with ' +
    'xcelerator selected. One-shot proof: no schedule, no split of bodies ' +
    'with more than 18 functions.',
    [
      rawStep('run', {
        type: 'inject',
        name: 'Run Provideam proof',
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
      fn('settings', 'Load proof settings',
        's1-provideam-proof-settings.js', ['next']),
      fn('reportRequest', 'Build Provideam request',
        's2-provideam-proof-request.js', ['next']),
      rawStep('reportHttp', {
        type: 'http request',
        name: 'POST Provideam report',
        method: 'use',
        ret: 'txt',
        url: '',
        timeout: '',
        mindspherePath: '',
        useMindsphereAuth: false,
        isAdmin: false
      }),
      fn('reportCheck', 'Check Provideam rows',
        's3-provideam-proof-check.js', ['next']),
      fn('tokenRequest', 'Build lake token request',
        's2-proof-token-request.js', ['next']),
      http('tokenHttp', 'POST lake token'),
      fn('tokenCheck', 'Check lake token',
        's3-proof-token-check.js', ['next']),
      fn('lakeUrl', 'Prepare lake upload URL',
        's4-provideam-proof-lake-url.js', ['next']),
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
        's5-provideam-proof-result.js', ['next']),
      debugStep('successDebug', 'Proof result', 'payload')
    ]);

  b.lane(2, 'SAFE FAILURE',
    'STAGE 2 - catch failures and report only a short sanitized reason. ' +
    'API key, tokens and signed URLs are not included.',
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
    info: 'Manual proof: one Provideam report day stored as-is in the lake.'
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
  new URL('../flows/vfc-provideam-lake-proof.json', import.meta.url),
  JSON.stringify(nodes, null, 2) + '\n'
);
console.log(
  `written flows/vfc-provideam-lake-proof.json: ${stats.nodes} nodes, ` +
  `longest line ${stats.longestLine}`
);
warnings.forEach((warning) => console.log(`warn: ${warning}`));
