// Builds flows/vfc-date-spike.json, a small VFC tab "Date type spike": does
// the parquet node write a real DATE column (and a time of day as a
// timestamp)? Two tests (numbers only), written to Sandbox/spike/ in the data lake.
// Usage: node scripts/build-vfc-date-spike.js
// Function code: scripts/vfc/x1-date-rows.js, x2-spike-path.js.
import { writeFileSync, mkdirSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  makeBuilder, fn, linkInStep, end, rawStep, compactLanes, measureSpacing,
  S, I, TS
} from './lib-flow-builder.js';

const FILE = 'vfc-date-spike.json';
const DATE = 'DATE';

const testLane = (b, r, key, title, info, schema) => b.lane(r, title, info, [
  linkInStep(key),
  { t: 'parquet', key: `${key}_pq`, table: key, schema },
  fn(`${key}_path`, 'Set spike path', 'x2-spike-path.js', ['next']),
  { t: 'write', key: `${key}_write`, name: `${title} to data lake` }
]);

function buildFlow() {
  const b = makeBuilder(360);
  let r = 1;
  b.lane(r++, 'SPIKE: BUILD ROWS',
    'one inject, one function: two small tables with numbers only (the first spike showed that the node reads text and Date objects as numbers: 2026-09-01 became 2026). A: a DATE column from a number of days since 1970-01-01. B: TIMESTAMP_MILLIS from epoch milliseconds, for a time of day (Excel day 1899-12-30, negative number) and for a date at midnight. Written to Sandbox/spike/ so the types and values can be read afterwards.',
    [
      rawStep('spikeInject', {
        type: 'inject', name: 'Run the date spike', topic: '', payload: '',
        payloadType: 'date', repeat: '', repeatEnd: '0', endTime: '0',
        crontab: '', offset: 'NaN', once: false, properties: '',
        timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false,
        powerMode: false
      }),
      fn('spikeRows', 'Build spike rows', 'x1-date-rows.js',
        ['TEST A', 'TEST B'], {}, true)
    ]);
  testLane(b, r++, 'TEST A', 'SPIKE A: DATE FROM DAY NUMBER',
    'parquet column d with type DATE, value the number of days since 1970-01-01 (20697 = 2026-09-01).',
    [['id', I], ['d', DATE]]);
  testLane(b, r++, 'TEST B', 'SPIKE B: TIMESTAMPS FROM MS',
    'TIMESTAMP_MILLIS from epoch milliseconds, for a time of day (1899-12-30 21:45:00, as in the Tableau data, a negative number) and for a date at midnight.',
    [['id', I], ['t', TS], ['dt', TS]]);
  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'Date type spike',
    disabled: false, allowCycles: false,
    info: 'Spike: can the parquet node write a DATE column? Output in Sandbox/spike/ of the data lake. Delete the tab after the test.'
  });
  return b.nodes;
}

mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
const nodes = buildFlow();
compactLanes(nodes);
const { errors, stats } = validateFlow(nodes);
if (errors.length) {
  throw new Error(`flow check failed for ${FILE}:\n  ${errors.join('\n  ')}`);
}
writeFileSync(new URL(`../flows/${FILE}`, import.meta.url),
  JSON.stringify(nodes, null, 2) + '\n');
console.log(`written flows/${FILE}: ${stats.nodes} nodes`);
console.log(`  spacing: ${measureSpacing(nodes, 0).overlaps} overlaps`);
