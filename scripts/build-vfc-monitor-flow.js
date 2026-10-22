// Builds the importable Run monitor tab.
// One access-key-protected HTTP route serves the page, status JSON and log
// history so the page can reuse the single key generated in the VFC.
// Usage: node scripts/build-vfc-monitor-flow.js
import { writeFileSync, mkdirSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  makeBuilder, code, fn, linkInStep, readStep, listNode, catchStep, rawStep,
  addLogLanes, compactLanes
} from './lib-flow-builder.js';

const FILE = 'vfc-run-monitor.json';
const ROUTE = '/reports-monitor/';

function buildFlow() {
  const b = makeBuilder(360);
  let row = 1;

  b.lane(row++, 'HTTP MONITOR',
    'One access-key-protected route serves page, status and history at ' +
    '/reports-monitor/ using the view query parameter. Generate its access ' +
    'key in the VFC after import. The page reuses it for all GET requests.',
    [
      rawStep('monitorIn', {
        type: 'http in',
        name: 'Get report monitor',
        endpoint: ROUTE,
        method: 'get',
        upload: false,
        access: 'key',
        key: '',
        users: '',
        powerMode: false
      }),
      fn(
        'route',
        'Route monitor request',
        'v1-route.js',
        ['PAGE', 'STATUS', 'HISTORY', 'ERROR'],
        {},
        true
      )
    ]);

  b.lane(row++, 'PAGE',
    'Returns the self-contained page. It polls status every 10 seconds and ' +
    'loads one month of CSV history only when requested.',
    [
      linkInStep('PAGE'),
      fn('page', 'Build monitor page', 'v6-monitor-page.js', ['next']),
      rawStep('pageResponse', {
        type: 'http response',
        name: 'Send page',
        statusCode: '',
        headers: {}
      })
    ]);

  b.lane(row++, 'STATUS',
    'Returns compact snapshots only: report-day checkpoints, PBI build and ' +
    'listener state, Config state, plus a derived STUCK state after 30 ' +
    'minutes without a checkpoint.',
    [
      linkInStep('STATUS'),
      fn('status', 'Build status JSON', 'v2-status-json.js', ['next']),
      rawStep('statusResponse', {
        type: 'http response',
        name: 'Send status',
        statusCode: '',
        headers: {}
      })
    ]);

  b.lane(row++, 'HISTORY REQUEST',
    'Validates the flow and month, lists one log folder, and reads the ' +
    'requested monthly CSV only when it exists.',
    [
      linkInStep('HISTORY'),
      fn(
        'historyRequest',
        'Check history request',
        'v3-history-request.js',
        ['next', 'ERROR']
      ),
      listNode('historyList'),
      fn(
        'historyPick',
        'Find history file',
        'v4-pick-history.js',
        ['next', 'NOT FOUND', 'ERROR'],
        {},
        true
      ),
      readStep('historyRead', 'Read history CSV'),
      fn('historyJson', 'Build history JSON', 'v5-history-json.js', ['next']),
      rawStep('historyResponse', {
        type: 'http response',
        name: 'Send history',
        statusCode: '',
        headers: {}
      })
    ]);

  b.lane(row++, 'ERROR RESPONSE',
    'Invalid requests keep their explicit 400, 404 or 503 status and JSON ' +
    'error. A list-object response that is not a list returns 502.',
    [
      linkInStep('ERROR'),
      rawStep('errorResponse', {
        type: 'http response',
        name: 'Send request error',
        statusCode: '',
        headers: {}
      })
    ]);

  b.lane(row++, 'HISTORY NOT FOUND',
    'A month with no CSV log returns 404 without starting a read-object ' +
    'request that could otherwise wait indefinitely.',
    [
      linkInStep('NOT FOUND'),
      rawStep('missingResponse', {
        type: 'http response',
        name: 'Send history not found',
        statusCode: '',
        headers: {}
      })
    ]);

  const commandStage = b.nextStage();
  b.comment(
    `[${commandStage}] BACKFILL COMMAND`,
    'POST /reports-monitor/command validates one backfill, records an ' +
    'audit line, and returns 202 before the target starts. Generate this ' +
    'HTTP In access key separately. Connect the three named BACKFILL link ' +
    'outs to their matching report tabs after import. A force command can ' +
    'run concurrently with the same flow.',
    row
  );
  const commandIn = b.newId();
  const commandFn = b.newId();
  const commandResponse = b.newId();
  const sihBackfill = b.newId();
  const rptBackfill = b.newId();
  const pbiBackfill = b.newId();
  const commandLog = b.linkOut('LOG', b.col(2), b.rowY(row) + 120);
  b.add({
    id: commandIn,
    type: 'http in',
    name: 'Post backfill command',
    endpoint: '/reports-monitor/command',
    method: 'post',
    upload: false,
    access: 'key',
    key: '',
    users: '',
    powerMode: false,
    x: b.col(0),
    y: b.rowY(row),
    wires: [[commandFn]]
  });
  b.add({
    id: commandFn,
    type: 'function',
    name: `${commandStage}.1 Validate backfill`,
    func: code('v10-command.js'),
    outputs: 5,
    language: 'javascript',
    noerr: 0,
    x: b.col(1),
    y: b.rowY(row),
    wires: [
      [commandResponse],
      [sihBackfill],
      [rptBackfill],
      [pbiBackfill],
      [commandLog]
    ]
  });
  b.add({
    id: sihBackfill,
    type: 'link out',
    name: 'to sih-hull BACKFILL',
    mode: 'link',
    links: [],
    x: b.col(2),
    y: b.rowY(row) + 40,
    wires: []
  });
  b.add({
    id: rptBackfill,
    type: 'link out',
    name: 'to rpt-hull BACKFILL',
    mode: 'link',
    links: [],
    x: b.col(2),
    y: b.rowY(row) + 80,
    wires: []
  });
  b.add({
    id: pbiBackfill,
    type: 'link out',
    name: 'to pbi-report BACKFILL',
    mode: 'link',
    links: [],
    x: b.col(2),
    y: b.rowY(row) + 160,
    wires: []
  });
  b.add({
    id: commandResponse,
    type: 'http response',
    name: 'Send command result',
    statusCode: '',
    headers: {},
    x: b.col(2),
    y: b.rowY(row),
    wires: []
  });
  row++;

  b.lane(row++, 'NODE ERROR',
    'A data-lake node error returns a generic 502. Credentials and request ' +
    'keys are never copied into the response.',
    [
      catchStep('monitorCatch', 'Catch monitor errors'),
      fn('monitorError', 'Build error response', 'v7-error-response.js',
        ['next']),
      rawStep('catchResponse', {
        type: 'http response',
        name: 'Send node error',
        statusCode: '',
        headers: {}
      })
    ]);

  addLogLanes(b, row, 'run-monitor');

  b.nodes.unshift({
    id: b.TAB,
    type: 'tab',
    label: 'Run monitor',
    disabled: false,
    allowCycles: false,
    info: 'Report status, monthly history and validated backfill commands. ' +
      'Generate both HTTP In access keys after import.'
  });
  return b.nodes;
}

mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
const nodes = buildFlow();
compactLanes(nodes);
const { errors, warnings, stats } = validateFlow(nodes);
if (errors.length) {
  throw new Error(`flow check failed for ${FILE}:\n  ${errors.join('\n  ')}`);
}
writeFileSync(new URL(`../flows/${FILE}`, import.meta.url),
  JSON.stringify(nodes, null, 2) + '\n');
console.log(
  `written flows/${FILE}: ${stats.nodes} nodes, ${stats.linkIn} link in / ` +
    `${stats.linkOut} link out, longest line ${stats.longestLine}`
);
warnings.forEach((warning) => console.log(`warn: ${warning}`));
