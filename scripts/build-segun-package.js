// Builds the package for the Tableau developer (Segun): the three CSV exports
// of the shift report tables plus a one page README, a data dictionary and a
// map of which columns each block of the old report needs.
// Reads parquet/shift_rpt_window.csv, _hour.csv, _event.csv (exports of the
// data lake tables, git-ignored) and writes session_handover/segun_package/
// (git-ignored: it holds real values). Usage: node scripts/build-segun-package.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { windowSchema, hourSchema, eventSchema } from './lib-rpt-schemas.js';
import { BLOCK_COLUMNS, BLOCK_INFO, COLUMN_INFO, DAY_GUIDE } from './lib-shift-report-columns.js';

const OUT = 'session_handover/segun_package';
const TABLES = [
  ['window', 'rpt_window', windowSchema],
  ['hour', 'rpt_hour', hourSchema],
  ['event', 'rpt_event', eventSchema],
];
const TYPE_TEXT = {
  UTF8: 'text',
  INT64: 'whole number',
  DOUBLE: 'decimal number',
  TIMESTAMP_MILLIS: 'date and time',
};
const quote = (v) => `"${String(v).replace(/"/g, '""')}"`;
const csv = (rows) => rows.map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';

mkdirSync(OUT, { recursive: true });

// The data files, copied as they are, after a check of the header.
const counts = {};
const days = new Set();
for (const [key, name, schema] of TABLES) {
  const text = readFileSync(`parquet/shift_${name}.csv`, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l !== '');
  const header = lines[0].split(',').map((h) => h.replace(/"/g, ''));
  const wanted = schema.map(([c]) => c);
  if (JSON.stringify(header) !== JSON.stringify(wanted)) {
    throw new Error(`${name}: the CSV header differs from lib-rpt-schemas.js`);
  }
  const dayAt = header.indexOf('production_day');
  lines.slice(1).forEach((l) => days.add(l.split(',')[dayAt].replace(/"/g, '')));
  counts[key] = lines.length - 1;
  writeFileSync(`${OUT}/shift_${name}.csv`, text);
}

// The data dictionary: every column of every table.
const dictionary = [['table', 'column', 'type', 'meaning', 'unit_or_note']];
for (const [, name, schema] of TABLES) {
  for (const [column, type] of schema) {
    const info = COLUMN_INFO[column];
    if (!info) {
      throw new Error(`no description for the column ${column}`);
    }
    dictionary.push([name, column, TYPE_TEXT[type], info[0], info[1]]);
  }
}
writeFileSync(`${OUT}/data_dictionary.csv`, csv(dictionary));

// The report map: which table, rows and columns each block of the report needs.
const map = [['report_block', 'data_status', 'table', 'rows_to_use', 'columns_needed']];
for (const [key, [blockName, status]] of Object.entries(BLOCK_INFO)) {
  const spec = BLOCK_COLUMNS[key] || {};
  const tables = Object.entries(spec);
  if (!tables.length) {
    map.push([blockName, status, '-', '-', '-']);
  }
  for (const [table, [filter, cols]] of tables) {
    const tableName = table === 'reckitt' ? 'not in the data (a file from Reckitt)' : `rpt_${table}`;
    map.push([blockName, status, tableName, filter, cols.join('; ')]);
  }
}
writeFileSync(`${OUT}/report_map.csv`, csv(map));

// The README: one page, plain text.
const dayList = [...days].sort().join(', ');
const readme = `SHIFT REPORT DATA FOR TABLEAU  -  B2 Line, Hull
==================================================

You have 3 data files and 2 helper files.

  shift_rpt_window.csv   ${String(counts.window).padStart(5)} rows  one row per line or machine, per window (the whole day, and each shift)
  shift_rpt_hour.csv     ${String(counts.hour).padStart(5)} rows  one row per line or machine, per hour
  shift_rpt_event.csv    ${String(counts.event).padStart(5)} rows  one row per stop
  data_dictionary.csv            every column: type, meaning, unit
  report_map.csv                 for each block of the old report: which file, which rows, which columns

Days in the files: ${dayList}


START HERE
  1. Work with the day 2026-09-15 first. It is complete.
  2. In every file filter  line_name = "B2 Line"  and  production_day = one day.
  3. Open report_map.csv. It tells you, block by block, where the numbers are.


SIX THINGS THAT WILL SAVE YOU TIME
  1. LINE AND MACHINES.  asset_level is "line" or "machine". The line row is the
     total for the line. The 7 machines are parts of it, never add them to the line.
  2. DAY AND SHIFT.  In shift_rpt_window.csv, window_kind is "day" or "shift".
     A day row is the whole day. Never add a day row to its shift rows.
  3. TIMES.  Columns ending in _start or _end are UTC. For the report use
     local_date and local_time (UK clock). A production day runs 06:00 to 06:00 local.
  4. EMPTY ON PURPOSE.  operator_min is always empty. comment text, costs, batch
     targets and per-head filler measurements are not in the data. On 2026-09-14
     there was no product, so performance, oee and the *_units columns are empty.
  5. ORDERS.  batch_id is filled on the machines 05 Antares and 07 Palletiser, not on the line.
  6. SHIFT NAMES.  shift_name is the crew name from Insights Hub (Gold, Green).
     The old report used other names.


WHICH DAY TO USE
${DAY_GUIDE.map(([d, why]) => `  ${d}\n      ${why}`).join('\n')}


HOW THE FILES JOIN
  All three files start with the same columns: site, line_id, line_name, asset_id,
  asset_name, asset_level, production_day. Join on those. The hour and event files
  also carry shift_name, product_key and batch_id.

Questions: ask the project owner. The files are exports of the data lake tables
rpt_window, rpt_hour and rpt_event and are refreshed from there.
`;
writeFileSync(`${OUT}/README.txt`, readme);
console.log(`written ${OUT}: 3 data files, README.txt, data_dictionary.csv (${dictionary.length - 1} rows), report_map.csv (${map.length - 1} rows)`);
