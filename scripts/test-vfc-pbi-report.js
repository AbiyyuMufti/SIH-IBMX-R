// Offline test of flows/vfc-pbi-report.json (step 1: machine names, shift
// names, calendar). The data lake is a map in memory with small CSV files.
// Usage: node scripts/test-vfc-pbi-report.js platform=xcelerator
//   node scripts/test-vfc-pbi-report.js platform=xcelerator real out=<file>
//   real: reads the real files of sharepoint/reference (local, git-ignored)
//   and writes the machine rows to <file> for a comparison with the report.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { runFlow, testPlatform } from './lib-vfc-runner.js';

const read = (f) => JSON.parse(readFileSync(new URL('../flows/' + f, import.meta.url), 'utf8'));
const config = read('vfc-config.json');
const flow = read('vfc-pbi-report.json');
const REF = 'eu_report/reference';
const OUT = 'eu_report/pbi_report/report';

let failures = 0;
const check = (ok, text) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + text);
  if (!ok) failures++;
};

// A small lake: the three Machine Names files and the Shift Patterns file.
const makeLake = () => new Map([
  [`${REF}/machine_names/site=Hull/Hull_MachineNames.csv`, [
    'MachineName,Dept,Area,Product Type',
    'B2 Auto,Liquids Pack,Liquids,Bottles',
    'GT4,Dries Pack,Dries,Blisters',
    'GT4 - Auto,Dries Pack,Dries,Blisters',
    'Old Mixer,Processing,Bulk,Bulk',
    ''
  ].join('\r\n')],
  [`${REF}/machine_names/site=Nottingham/Notts_MachineNames.csv`, [
    'MachineName,Dept,Area,Product Type',
    'S06,Strepsils,Strepsils Packing,Strepsils Blisters',
    'N11,Solid Dose,SD Packing,Blisters',
    'Fette 10,Solid Dose,Tabletting,Tablets',
    ''
  ].join('\n')],
  [`${REF}/machine_names/site=Weinheim/Wein_MachineNames.csv`, [
    'MachineName,Dept,Area,Product Type',
    '"Line 4, new",Packing,Line,Boxes',
    ''
  ].join('\n')],
  [`${REF}/shift_naming/site=All/Shift Patterns.csv`, [
    'ShiftName,Shift',
    'FriDay,Day',
    'FriNight,Night',
    'MonDay,Day',
    'SunDay - Blue,Blue',
    ''
  ].join('\n')]
]);

const run = (job, extra = {}) => runFlow(flow, {
  startDay: '2026-10-15', startPayload: job, write: true, configNodes: config,
  platform: testPlatform(), lake: makeLake(), clientId: 'x', clientSecret: 'y',
  fetchImpl: async () => { throw new Error('no API call expected'); },
  ...extra
});
const tableWrites = (stats) => stats.written.filter((p) => p.startsWith(OUT));
const rowsOf = (stats, name) => (stats.parquetPayloads[name] || []).flat();
const logText = (stats) => stats.logs.map(String).join('\n');

// 1. everything, write mode
let stats = await run({});
check(stats.errors.length === 0, 'no error: ' + stats.errors.join(' | '));
check(JSON.stringify(tableWrites(stats).sort()) === JSON.stringify([
  `${OUT}/pbi_calendar/pbi_calendar.parquet`,
  `${OUT}/pbi_machine_names/pbi_machine_names.parquet`,
  `${OUT}/pbi_shift_naming/pbi_shift_naming.parquet`
]), 'three files written at the planned paths: ' + tableWrites(stats).join(', '));
const machines = rowsOf(stats, 'Write pbi_machine_names parquet');
const byKey = Object.fromEntries(machines.map((m) => [m.unique_machine_name, m]));
check(machines.length === 5, `machine rows 5 (Hull 2, Nottingham 2, Weinheim 1): ${machines.length}`);
check(!byKey['GT4 - Auto-Hull'] && !byKey['Old Mixer-Hull'], 'Hull: GT4 - Auto and the Processing dept are left out');
check(!byKey['Fette 10-Nottingham'] && byKey['S06-Nottingham'], 'Nottingham: only the packing areas');
check(byKey['Line 4, new-Weinheim'] && byKey['Line 4, new-Weinheim'].dept === 'Packing', 'Weinheim: all rows, a quoted comma survives');
check(byKey['B2 Auto-Hull'].site_name === 'Hull' && byKey['B2 Auto-Hull'].area === 'Liquids' &&
  byKey['B2 Auto-Hull'].product_type === 'Bottles', 'machine row columns');
const shifts = rowsOf(stats, 'Write pbi_shift_naming parquet').map((s) => s.shift).sort();
check(JSON.stringify(shifts) === JSON.stringify(['Blue', 'Day', 'Night']), 'shift names distinct: ' + shifts.join(','));
const calendar = rowsOf(stats, 'Write pbi_calendar parquet');
check(calendar.length === 14610 && calendar[0].date === '2011-01-01' &&
  calendar[calendar.length - 1].date === '2050-12-31', `calendar 14610 rows from 2011-01-01 to 2050-12-31: ${calendar.length}`);
const mon = calendar.find((c) => c.date === '2026-10-15');
check(mon.week_start === '2026-10-12' && mon.week_number === 42 && mon.month === 'October',
  'calendar columns for 2026-10-15 (Thursday): week starts 2026-10-12, week 42');
check(machines.every((m) => Number.isInteger(m.loaded_at)), 'loaded_at is a timestamp number');

// 2. dry run: nothing written, the log says why
stats = await run({}, { write: false });
check(tableWrites(stats).length === 0, 'dry run: no table file written');
check((logText(stats).match(/DRY RUN/g) || []).length >= 3, 'dry run: a DRY RUN log line per table');

// 3. parameters: one table, one site
stats = await run({ tables: ['pbi_shift_naming'] });
check(JSON.stringify(tableWrites(stats)) === JSON.stringify([`${OUT}/pbi_shift_naming/pbi_shift_naming.parquet`]),
  'job with one table writes only that table');
stats = await run({ tables: ['pbi_machine_names'], sites: ['Hull'] });
const hull = rowsOf(stats, 'Write pbi_machine_names parquet');
check(hull.length === 2 && hull.every((m) => m.site_name === 'Hull'), 'job with one site: only Hull rows');

// 4. a site without a file: nothing written for that table, others fine
const lake = makeLake();
lake.delete(`${REF}/machine_names/site=Weinheim/Wein_MachineNames.csv`);
stats = await run({}, { lake });
check(!tableWrites(stats).some((p) => p.includes('pbi_machine_names')), 'missing site file: machine names not written');
check(/FAILED, NOTHING WRITTEN[^\n]*Weinheim/.test(logText(stats)), 'missing site file: the log names the site');
check(tableWrites(stats).length === 2, 'missing site file: the other two tables are still written');

// 5. the newest of two files is read
const two = makeLake();
two.set(`${REF}/shift_naming/site=All/Old Patterns.csv`, 'ShiftName,Shift\nX,Purple\n');
stats = await run({ tables: ['pbi_shift_naming'] }, {
  lake: two,
  lakeTimes: {
    [`${REF}/shift_naming/site=All/Old Patterns.csv`]: '2025-01-01T00:00:00.000Z',
    [`${REF}/shift_naming/site=All/Shift Patterns.csv`]: '2026-10-01T00:00:00.000Z'
  }
});
check(JSON.stringify(rowsOf(stats, 'Write pbi_shift_naming parquet').map((s) => s.shift).sort()) ===
  JSON.stringify(['Blue', 'Day', 'Night']), 'two files: the newest one is read');

// 5b. the list node gives the key with the tenant folder in front
stats = await run({ tables: ['pbi_machine_names'] }, { listKeyPrefix: 'data/ten=reckitt/' });
check(rowsOf(stats, 'Write pbi_machine_names parquet').length === 5,
  'keys with data/ten=<tenant>/ in front are read (prefix removed)');
stats = await run({ tables: ['pbi_machine_names'] }, { listKeyPrefix: '/' });
check(rowsOf(stats, 'Write pbi_machine_names parquet').length === 5,
  'keys with a leading slash are read');

// 6. an unknown table is refused before anything runs
stats = await run({ tables: ['pbi_nothing'] });
check(tableWrites(stats).length === 0 && stats.errors.some((e) => /unknown/.test(e)), 'unknown table name: error, nothing written');

// 7. real files (optional)
if (process.argv.includes('real')) {
  const dir = new URL('../sharepoint/reference/', import.meta.url);
  const realLake = new Map();
  if (existsSync(dir)) {
    for (const type of ['machine_names', 'shift_naming']) {
      for (const site of readdirSync(new URL(`${type}/`, dir))) {
        for (const f of readdirSync(new URL(`${type}/${site}/`, dir))) {
          realLake.set(`${REF}/${type}/${site}/${f}`, readFileSync(new URL(`${type}/${site}/${f}`, dir), 'utf8'));
        }
      }
    }
    stats = await run({ tables: ['pbi_machine_names', 'pbi_shift_naming'] }, { lake: realLake });
    const real = rowsOf(stats, 'Write pbi_machine_names parquet');
    const perSite = {};
    real.forEach((m) => { perSite[m.site_name] = (perSite[m.site_name] || 0) + 1; });
    console.log('real machine rows per site:', JSON.stringify(perSite),
      '| shifts:', JSON.stringify(rowsOf(stats, 'Write pbi_shift_naming parquet').map((s) => s.shift).sort()));
    const out = process.argv.find((a) => a.startsWith('out='));
    if (out) writeFileSync(out.slice(4), JSON.stringify(real));
  } else {
    console.log('no local sharepoint/reference folder: real check skipped');
  }
}

console.log(failures ? `${failures} check(s) FAILED` : 'all checks passed');
process.exit(failures ? 1 : 0);
