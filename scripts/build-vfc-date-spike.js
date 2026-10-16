// Builds flows/vfc-date-spike.json, a small VFC tab "Date type spike": which
// date and time types does the parquet node write, with which value forms,
// in the legacy (parquetjs) and the modern (hyparquet) engine? Twelve cases,
// each its own parquet node, written to Sandbox/spike/ in the data lake. An
// error of a case becomes a text file <case>_ERROR.txt next to the results.
// Usage: node scripts/build-vfc-date-spike.js
// Function code: scripts/vfc/x1-*.js, x2-spike-path.js, x3-spike-error.js.
import { writeFileSync, mkdirSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  makeBuilder, fn, linkInStep, rawStep, catchStep, writeStep,
  compactLanes, measureSpacing, I
} from './lib-flow-builder.js';

const FILE = 'vfc-date-spike.json';
const LEGACY = 'parquetjs';
const MODERN = 'hyparquet';

// One case per lane: file name (= msg.spike), engine, column type, text.
const LEGACY_CASES = [
  ['legacy_date_day_number', LEGACY, 'DATE', 'a day number'],
  ['legacy_timestamp_ms', LEGACY, 'TIMESTAMP_MILLIS', 'epoch ms, 2026'],
  ['legacy_timestamp_ms_1899', LEGACY, 'TIMESTAMP_MILLIS',
    'epoch ms, 1899-12-30 time of day (negative)'],
  ['legacy_time_millis', LEGACY, 'TIME_MILLIS', 'ms of a day']
];
const MODERN_CASES = [
  ['modern_date_day_number', MODERN, 'DATE', 'a day number'],
  ['modern_date_object', MODERN, 'DATE', 'a JS Date object'],
  ['modern_date_text', MODERN, 'DATE', 'ISO text'],
  ['modern_timestamp_ms', MODERN, 'TIMESTAMP_MILLIS', 'epoch ms, 2026'],
  ['modern_timestamp_ms_1899', MODERN, 'TIMESTAMP_MILLIS',
    'epoch ms, 1899-12-30 time of day (negative)'],
  ['modern_timestamp_object', MODERN, 'TIMESTAMP_MILLIS', 'a JS Date object'],
  ['modern_timestamp_bigint', MODERN, 'TIMESTAMP_MILLIS', 'a BigInt of ms'],
  ['modern_time_millis', MODERN, 'TIME_MILLIS', 'ms of a day']
];

function caseLane(b, r, [name, engine, type, form]) {
  const key = name.toUpperCase();
  b.lane(r, `CASE ${name}`,
    `engine ${engine}, column x of type ${type}, value ${form}. The result is Sandbox/spike/${name}.parquet; a failure gives ${name}_ERROR.txt.`,
    [
      linkInStep(key),
      {
        t: 'parquet', key: `${key}_pq`, table: name, engine,
        schema: [['id', I], ['x', type]]
      },
      fn(`${key}_path`, 'Set spike path', 'x2-spike-path.js', ['next']),
      writeStep(`${key}_write`, `${name} to data lake`)
    ]);
}

function buildFlow() {
  const b = makeBuilder(360);
  let r = 1;
  b.lane(r++, 'SPIKE: BUILD ROWS',
    'one inject, one function that builds the legacy engine cases (numbers only: legacy reads text and Date objects as numbers); its last output starts the modern engine cases in the next lane. Each case has its own parquet node. Run once, then the result files in Sandbox/spike/ are read with pyarrow.',
    [
      rawStep('spikeInject', {
        type: 'inject', name: 'Run the date spike', topic: '', payload: '',
        payloadType: 'date', repeat: '', repeatEnd: '0', endTime: '0',
        crontab: '', offset: 'NaN', once: false, properties: '',
        timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false,
        powerMode: false
      }),
      fn('legacyRows', 'Build legacy cases', 'x1-legacy-rows.js',
        [...LEGACY_CASES.map(([name]) => name.toUpperCase()), 'MODERN'], {},
        true)
    ]);
  b.lane(r++, 'SPIKE: MODERN CASES',
    'the last output of the legacy function starts this one: it builds the modern engine cases (day numbers, epoch ms, negative ms, Date objects, ISO text, BigInt, ms of a day).',
    [
      linkInStep('MODERN'),
      fn('modernRows', 'Build modern cases', 'x1-modern-rows.js',
        MODERN_CASES.map(([name]) => name.toUpperCase()), {}, true)
    ]);
  [...LEGACY_CASES, ...MODERN_CASES].forEach((c) => caseLane(b, r++, c));
  b.lane(r++, 'SPIKE: ERRORS',
    'a catch node takes the error of any case and writes it as a text file next to the results, so nothing needs to be copied by hand.',
    [
      catchStep('errCatch', 'Catch spike errors'),
      fn('errFn', 'Describe spike error', 'x3-spike-error.js', ['next']),
      writeStep('errWrite', 'Spike error to data lake')
    ]);
  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'Date type spike',
    disabled: false, allowCycles: false,
    info: 'Spike: which date and time types does the parquet node write (legacy and modern engine)? Output in Sandbox/spike/ of the data lake. Delete the tab after the test.'
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
