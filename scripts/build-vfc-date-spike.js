// Builds flows/vfc-date-spike.json, a small VFC tab "Date type spike" (v4):
// the legacy (parquetjs) engine writes column names with spaces and dots in
// the real Tableau types, a null in every type, and rows with missing keys.
// Eight cases, each its own parquet node, written to Sandbox/spike/. An error
// of a case becomes a text file <case>_ERROR.txt next to the results.
// Usage: node scripts/build-vfc-date-spike.js
// Function code: scripts/vfc/x1-rows.js, x2-spike-path.js, x3-spike-error.js.
import { writeFileSync, mkdirSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  makeBuilder, fn, linkInStep, rawStep, catchStep, writeStep,
  compactLanes, measureSpacing, I, D, S, TS
} from './lib-flow-builder.js';

const FILE = 'vfc-date-spike.json';
const DATE = 'DATE';

// One case per lane: file name (= msg.spike), columns, text.
const CASES = [
  ['names_and_types_with_nulls', [
    ['Good Parts', I], ['Planned OpT', I], ['Capacity', D], ['Date', DATE],
    ['ShiftStartDate.1', DATE], ['Time', TS], ['Duration', TS],
    ['Time in Mins', D], ['Value', S], ['Volume Key.1', S],
    ['ShiftName - Copy', S], ['Unique Machine Name', S]
  ], 'names with spaces, dots and a dash in the real types; row 2 has a null in every nullable column'],
  ['null_int64', [['id', I], ['x', I]], 'INT64 with a null'],
  ['null_double', [['id', I], ['x', D]], 'DOUBLE with a null'],
  ['null_date', [['id', I], ['x', DATE]], 'DATE with a null'],
  ['null_text', [['id', I], ['x', S]], 'UTF8 with a null'],
  ['null_timestamp', [['id', I], ['x', TS]], 'TIMESTAMP_MILLIS with a null'],
  ['missing_keys', [['id', I], ['i', I], ['s', S]],
    'a row where the keys i and s are missing (not null)'],
  ['timestamp_1970_time_of_day', [['id', I], ['x', TS]],
    'a time of day (21:45) as a timestamp on 1970-01-01, with a null']
];

function caseLane(b, r, [name, schema, text]) {
  const key = name.toUpperCase();
  b.lane(r, `CASE ${name}`,
    `engine parquetjs: ${text}. The result is Sandbox/spike/${name}.parquet; a failure gives ${name}_ERROR.txt.`,
    [
      linkInStep(key),
      { t: 'parquet', key: `${key}_pq`, table: name, engine: 'parquetjs', schema },
      fn(`${key}_path`, 'Set spike path', 'x2-spike-path.js', ['next']),
      writeStep(`${key}_write`, `${name} to data lake`)
    ]);
}

function buildFlow() {
  const b = makeBuilder(360);
  let r = 1;
  b.lane(r++, 'SPIKE: BUILD ROWS',
    'one inject, one function that builds the rows of all eight cases (day numbers for dates, ms for times). Each case has its own parquet node. Run once, then the result files in Sandbox/spike/ are read with pyarrow.',
    [
      rawStep('spikeInject', {
        type: 'inject', name: 'Run the spike', topic: '', payload: '',
        payloadType: 'date', repeat: '', repeatEnd: '0', endTime: '0',
        crontab: '', offset: 'NaN', once: false, properties: '',
        timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false,
        powerMode: false
      }),
      fn('spikeRows', 'Build spike rows', 'x1-rows.js',
        CASES.map(([name]) => name.toUpperCase()), {}, true)
    ]);
  CASES.forEach((c) => caseLane(b, r++, c));
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
    info: 'Spike v4: column names with spaces and dots, nulls and missing keys in the legacy parquet engine. Output in Sandbox/spike/ of the data lake. Delete the tab after the test.'
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
