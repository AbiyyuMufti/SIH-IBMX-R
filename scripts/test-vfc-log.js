// Offline test of the CSV log (lanes ERRORS, LOG, LOG WRITE) with the mini
// runner and the mock Insights Hub. Checks: header once, two runs append,
// a thrown error is caught and logged, nasty text survives a CSV round trip,
// an unclear read error never replaces the old file.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { runFlow } from './lib-vfc-runner.js';
import { makeMockFetch } from './lib-mock-ih.js';

const read = (f) => JSON.parse(readFileSync(new URL('../flows/' + f, import.meta.url), 'utf8'));
const config = read('vfc-config.json');
const hull = read('vfc-site-hull.json');
const PATH = 'mufti_test/logs/hull/log_2026-10.csv';

// A small RFC 4180 reader: quoted fields, doubled quotes, any separator.
function parseCsv(text, sep = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  return rows;
}

let failures = 0;
const check = (ok, text) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + text);
  if (!ok) failures++;
};
const run = (nodes, scenario, lake) =>
  runFlow(nodes, {
    startDay: '2026-09-30', write: false, configNodes: config, lake,
    fetchImpl: makeMockFetch(scenario), clientId: 'x', clientSecret: 'y',
    allAssets: true
  });

// 1. two runs append to the same file, one header
const lake = new Map();
await run(hull, 'ok', lake);
await run(hull, 'kpi-413', lake);
let rows = parseCsv(lake.get(PATH));
check(rows.length === 3, `two runs: header + 2 rows (got ${rows.length})`);
check(rows[0][0] === 'ts_utc' && rows[0].length === 9, 'header has 9 columns');
check(rows[1][6] === 'info' && rows[2][6] === 'failed', 'levels info, failed');
check(/Too many status changes/.test(rows[2][8]), 'API message is in the log');

// 2. a thrown error with commas, quotes and line breaks is caught and logged
const nasty = 'boom, "quoted"\nsecond line | pipe';
const broken = JSON.parse(JSON.stringify(hull));
const target = broken.find((n) => n.name === '3.5 Build KPI rows');
target.func = `throw new Error(${JSON.stringify(nasty)});`;
const lake2 = new Map();
const stats = await run(broken, 'ok', lake2);
rows = parseCsv(lake2.get(PATH) || '');
const errRow = rows.find((r) => r[6] === 'error');
check(Boolean(errRow), 'catch logged the thrown error');
check(errRow && errRow[7] === '3.5 Build KPI rows', 'source = node name');
check(errRow && errRow[8].includes('boom, "quoted"'), 'comma and quote survive');
check(errRow && !/\n/.test(errRow[8]), 'line break became a space');
check(rows.every((r) => r.length === 9), 'every row has 9 columns');
check(stats.errors.length === 0, 'no uncaught error left');

// 3. unclear read error: new time-stamped file, old file untouched
const l4 = hull.find((n) => /Append log rows/.test(n.name)).func;
const makeMsg = (readError) => ({
  path: PATH, payload: '', logReadError: readError,
  logRows: [{ ts_utc: '2026-10-04T10:00:00.000Z', seq: 1, flow: 'hull', site: 'Hull', level: 'info', message: 'x' }]
});
const out = vm.runInNewContext('(function(msg){' + l4 + '\n})', {})(makeMsg('permission denied'));
check(/log_2026-10_\d+\.csv$/.test(out.path), 'fallback file name has a time stamp');
check(/permission denied/.test(out.payload), 'fallback file says why');

// 4. a not-found read starts a new file
const out2 = vm.runInNewContext('(function(msg){' + l4 + '\n})', {})(makeMsg('file not found'));
check(out2.path === PATH, 'not found: same path, new file');

console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exitCode = failures ? 1 : 0;
