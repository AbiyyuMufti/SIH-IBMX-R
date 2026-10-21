// Builds the importable Run monitor tab.
// One access-key-protected HTTP route serves the page, status JSON and log
// history so the page can reuse the single key generated in the VFC.
// Usage: node scripts/build-vfc-monitor-flow.js
import { writeFileSync, mkdirSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  makeBuilder, fn, linkInStep, readStep, listNode, catchStep, rawStep,
  compactLanes
} from './lib-flow-builder.js';

const FILE = 'vfc-run-monitor.json';
const ROUTE = '/reports-monitor/:view?';

function buildFlow() {
  const b = makeBuilder(360);
  let row = 1;

  b.lane(row++, 'HTTP MONITOR',
    'One access-key-protected route serves the page at /reports-monitor, ' +
    'status JSON at /reports-monitor/status, and one-month log history at ' +
    '/reports-monitor/history. Generate its access key in the VFC after ' +
    'import. The page reuses the key for its two read requests.',
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
        'm1-route.js',
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
      fn('page', 'Build monitor page', 'm6-monitor-page.js', ['next']),
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
      fn('status', 'Build status JSON', 'm2-status-json.js', ['next']),
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
        'm3-history-request.js',
        ['next', 'ERROR']
      ),
      listNode('historyList'),
      fn(
        'historyPick',
        'Find history file',
        'm4-pick-history.js',
        ['next', 'NOT FOUND', 'ERROR'],
        {},
        true
      ),
      readStep('historyRead', 'Read history CSV'),
      fn('historyJson', 'Build history JSON', 'm5-history-json.js', ['next']),
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

  b.lane(row++, 'NODE ERROR',
    'A data-lake node error returns a generic 502. Credentials and request ' +
    'keys are never copied into the response.',
    [
      catchStep('monitorCatch', 'Catch monitor errors'),
      fn('monitorError', 'Build error response', 'm7-error-response.js',
        ['next']),
      rawStep('catchResponse', {
        type: 'http response',
        name: 'Send node error',
        statusCode: '',
        headers: {}
      })
    ]);

  b.nodes.unshift({
    id: b.TAB,
    type: 'tab',
    label: 'Run monitor',
    disabled: false,
    allowCycles: false,
    info: 'Read-only status and monthly run-log history for the report flows. ' +
      'Generate the access key on the HTTP In node after import.'
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
