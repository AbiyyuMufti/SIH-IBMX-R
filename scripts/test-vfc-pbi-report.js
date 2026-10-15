// Offline test of flows/vfc-pbi-report.json (step 1: machine names, shift
// names, calendar; step 2: plan OPT and time utilisation). The data lake is a map in memory with small CSV files.
// Usage: node scripts/test-vfc-pbi-report.js platform=xcelerator
//   node scripts/test-vfc-pbi-report.js platform=xcelerator real out=<file>
//   node scripts/test-vfc-pbi-report.js platform=xcelerator real plan dir=<dir>
//   (plan: also the real plan OPT month files, writes plan.json and util.json)
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
const STEP1 = ['pbi_machine_names', 'pbi_shift_naming', 'pbi_calendar'];
let stats = await run({ tables: STEP1 });
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
// WEEKNUM(date, 2): week 1 holds 1 January, so a late December day can be 53
const week = (d) => calendar.find((c) => c.date === d).week_number;
check(week('2011-01-01') === 1 && week('2011-01-03') === 2 && week('2024-12-30') === 53 &&
  week('2025-01-01') === 1 && week('2050-12-31') === 53,
  'week number like DAX WEEKNUM(date, 2): 2011-01-01 week 1, 2024-12-30 week 53, 2025-01-01 week 1');
check(machines.every((m) => Number.isInteger(m.loaded_at)), 'loaded_at is a timestamp number');

// 2. dry run: nothing written, the log says why
stats = await run({ tables: STEP1 }, { write: false });
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
stats = await run({ tables: STEP1 }, { lake });
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

// ---- step 2: plan OPT and time utilisation (synthetic month files) ----
const SRC = 'eu_report/pbi_report/source';
const PLAN_HEAD = ['SiteName', 'YYYY-MM-DD', 'AreaName', 'MachineName', 'ShiftName',
  'ShiftStartTime', 'PartName', 'Good Parts', 'Defect Parts', 'Target', 'Capacity',
  'OEE', 'Total Time', 'Planned OpT', 'OEE Time', 'Downtime Units'].join(',');
const planRow = (site, date, area, machine, shift, part, good, cap, total, planned, oee, down) =>
  [site, date, area, machine, shift, `${date} 06:00:00`, part, good, '0', '0.00', cap, '50%',
    total, planned, oee, down].map((v) => (String(v).includes(',') ? `"${v}"` : v)).join(',');
const glide = (site, line, bucket, months) => [site, line, bucket, ...months].join(',');
const planLake = () => {
  const lake = makeLake();
  lake.set(`${SRC}/plan_opt/site=Hull/plan_opt_2026-09.csv`, [
    PLAN_HEAD,
    planRow('Hull', '2026-09-01', 'Hull Liquids', 'B2 Auto', 'FriDay', 'NFC 12 X 100ML ', 1500, '2400.50', '10:00:00', '09:30:45', '04:20:59', '120.25'),
    planRow('Hull', '2026-09-01', 'Hull Liquids', 'B2 Auto', 'FriDay', 'Gavi 12 X 150 Russian Crypto', 20, '100.00', '02:30:30', '02:30:30', '01:00:00', '5.00'),
    planRow('Hull', '2026-09-02', 'Hull Liquids', 'B2 Auto', 'Mystery Shift', 'NFC 12 X 100ML ', 0, '0.00', '12:00:00', '00:00:00', '00:00:00', '0.00'),
    planRow('Hull', '2026-09-01', 'Hull Dries', '4 Tonne', 'FriDay', 'Bulk', 5, '1.00', '08:00:00', '08:00:00', '08:00:00', '0.00'),
    planRow('Hull', '2026-09-01', 'Hull Dries', 'GT4 - Auto', 'FriDay', 'X', 5, '1.00', '08:00:00', '08:00:00', '08:00:00', '0.00'),
    planRow('Hull', '2026-09-01', 'Hull Dries', 'Bosch Capsulator ', 'FriDay', 'X', 5, '1.00', '08:00:00', '08:00:00', '08:00:00', '0.00'),
    planRow('Hull', '2026-09-01', 'Hull Dries', '', 'FriDay', 'X', 5, '1.00', '08:00:00', '08:00:00', '08:00:00', '0.00'),
    ''
  ].join('\n'));
  lake.set(`${SRC}/plan_opt/site=Hull/plan_opt_2026-10.csv`, [
    PLAN_HEAD,
    planRow('Hull', '2026-10-03', 'Hull Liquids', 'B2 Auto', 'FriDay', 'NFC 12 X 100ML ', 700, '1000.00', '08:00:00', '08:00:00', '03:00:00', '10.00'),
    ''
  ].join('\n'));
  lake.set(`${SRC}/plan_opt/site=Nottingham/plan_opt_2026-09.csv`, [
    PLAN_HEAD,
    planRow('Nottingham', '2026-09-01', ' Strepsils Packing', 'S06', 'MonDay', 'Lozenge 24', 100, '200.00', '08:00:00', '08:00:00', '07:00:00', '1.00'),
    planRow('Nottingham', '2026-09-01', 'SD Packing', 'N11', 'MonDay', 'Tab', 100, '200.00', '08:00:00', '08:00:00', '07:00:00', '1.00'),
    planRow('Nottingham', '2026-09-01', 'Strepsils Packing', 'S07', 'MonDay', 'No leading space', 1, '1.00', '08:00:00', '08:00:00', '01:00:00', '0.00'),
    planRow('Nottingham', '2026-09-01', 'SD Packing', 'S14', 'MonDay', 'Tab', 1, '1.00', '08:00:00', '08:00:00', '01:00:00', '0.00'),
    planRow('Nottingham', '2026-09-01', 'SD Packing', 'N11 Auto', 'MonDay', 'Tab', 1, '1.00', '08:00:00', '08:00:00', '01:00:00', '0.00'),
    planRow('Nottingham', '2026-09-01', 'SD Manufacturing', 'X99', 'MonDay', 'Bulk', 1, '1.00', '08:00:00', '08:00:00', '01:00:00', '0.00'),
    ''
  ].join('\n'));
  lake.set(`${REF}/glidepaths/site=Hull/Glidepath Hull.csv`, [
    '\uFEFFSite Name,Line,OEE Bucket,01/08/2026,01/09/2026,01/10/2026',
    glide('Hull', 'B2 Auto', '% OEE', ['50.5', '56.1', '']),
    glide('Hull', 'B2 Auto', 'Planned Downtime (Total)', ['10', '12.5', '13']),
    glide('Hull', 'B2 Auto', 'Unplanned Downtime (Total)', ['20', '21.5', '']),
    glide('Hull', 'B2 Auto', 'Breakdown', ['1', '2', '3']),
    ''
  ].join('\n'));
  lake.set(`${REF}/glidepaths/site=Nottingham/Glidepath Notts.csv`, [
    'Site Name,Line,OEE Bucket,01/09/2026',
    glide('Nottingham', 'S06', '% OEE', ['40']),
    ''
  ].join('\n'));
  lake.set(`${REF}/shift_naming/site=All/Shift Patterns.csv`, [
    'ShiftName,Shift', 'FriDay,Day', 'MonDay,Day', 'FriNight,Night', ''
  ].join('\n'));
  return lake;
};
const STEP2 = ['pbi_plan_opt', 'pbi_time_utilisation'];
const PLAN = 'Write pbi_plan_opt parquet';
const UTIL = 'Write pbi_time_utilisation parquet';
const outPath = (table, site, month) => `${OUT}/${table}/site=${site}/${table}_${month}.parquet`;

// 8. Hull, September 2026
stats = await run({ tables: STEP2, sites: ['Hull'], from: '2026-09', to: '2026-09' }, { lake: planLake() });
check(stats.errors.length === 0, 'plan: no error: ' + stats.errors.join(' | '));
check(JSON.stringify(tableWrites(stats).sort()) === JSON.stringify([
  outPath('pbi_plan_opt', 'Hull', '2026-09'), outPath('pbi_time_utilisation', 'Hull', '2026-09')]),
  'plan: one file per table, site and month: ' + tableWrites(stats).join(', '));
let plan = rowsOf(stats, PLAN);
check(plan.length === 3, `plan rows 3 (4 Tonne, GT4 - Auto, Bosch Capsulator and the blank machine are left out): ${plan.length}`);
const first = plan.find((r) => r.date === '2026-09-01' && r.part_name.startsWith('NFC'));
check(first.unique_machine_name === 'B2 Auto-Hull' && first.product_key === 'B2 Auto-Hull NFC 12 X 100ML',
  'plan: unique machine name, product key; trailing spaces of the part name are removed: ' + JSON.stringify(first.product_key));
check(first.total_time === 600 && first.planned_opt === 570 && first.oee_time === 260,
  `plan: minutes without seconds (10:00:00, 09:30:45, 04:20:59): ${first.total_time}, ${first.planned_opt}, ${first.oee_time}`);
check(first.good_parts === 1500 && first.capacity === 2400.5 && first.downtime_units === 120.25 &&
  first.area_name === 'Hull Liquids' && first.site_name === 'Hull', 'plan: numbers and names');
check(first.shift_name === 'Day', 'plan: shift name mapped from the Shift Patterns file');
check(first.oee_target === 56.1 && first.pdt_target === 12.5 && first.updt_target === 21.5,
  'plan: the three targets of the month (OEE, PDT, UPDT)');
check(first.source_hours === null && Number.isInteger(first.loaded_at), 'plan: source_hours empty, loaded_at set');
const gavi = plan.find((r) => r.part_name.startsWith('Gavi'));
check(gavi.part_name === 'Gavi 12 x 150 russian Crypto', 'plan: Hull part name text replaced as in the report');
const mystery = plan.find((r) => r.date === '2026-09-02');
check(mystery.shift_name === null, 'plan: a shift name that is not in the file gives an empty shift');
check(/shift not mapped: Mystery Shift/.test(logText(stats)), 'plan: the check log names the unmapped shift');
const util = rowsOf(stats, UTIL);
const u1 = util.find((r) => r.date === '2026-09-01');
check(util.length === 2 && u1.machine_name === 'B2 Auto', 'time utilisation: one row per machine and day: ' + util.length);
check(Math.abs(u1.total_time_total - 750.5) < 1e-9 && Math.abs(u1.planned_opt_total - 721.25) < 1e-9 &&
  Math.abs(u1.oee_time_total - (260 + 59 / 60 + 60)) < 1e-9,
  'time utilisation: sums of minutes with seconds (600 + 150.5, 570.75 + 150.5, 260.98 + 60)');
check(u1.all_time === 1440 && u1.unique_machine_name === 'B2 Auto-Hull', 'time utilisation: All Time 1440, unique name');

// 9. months of the job: a missing month is skipped, an existing one is built
stats = await run({ tables: STEP2, sites: ['Hull'], from: '2026-08', to: '2026-10' }, { lake: planLake() });
check(JSON.stringify(tableWrites(stats).sort()) === JSON.stringify([
  outPath('pbi_plan_opt', 'Hull', '2026-09'), outPath('pbi_plan_opt', 'Hull', '2026-10'),
  outPath('pbi_time_utilisation', 'Hull', '2026-09'), outPath('pbi_time_utilisation', 'Hull', '2026-10')]),
  'months: 2026-09 and 2026-10 built, 2026-08 has no file');
check(/no plan OPT file for 2026-08, skipped/.test(logText(stats)), 'months: the missing month is logged');
const oct = rowsOf(stats, PLAN).find((r) => r.date === '2026-10-03');
check(oct.oee_target === null && oct.pdt_target === 13 && oct.updt_target === null,
  'targets: an empty glidepath cell gives an empty target, a filled one is kept');

// 10. Nottingham rules
stats = await run({ tables: STEP2, sites: ['Nottingham'], from: '2026-09', to: '2026-09' }, { lake: planLake() });
plan = rowsOf(stats, PLAN);
check(JSON.stringify(plan.map((r) => r.machine_name).sort()) === JSON.stringify(['N11', 'S06']),
  'Nottingham plan: only the two areas; S14, N11 Auto and the area without the leading space are left out: ' + plan.map((r) => r.machine_name));
check(plan.find((r) => r.machine_name === 'S06').area_name === ' Strepsils Packing' &&
  plan.find((r) => r.machine_name === 'S06').oee_target === 40, 'Nottingham plan: the area keeps its leading space, target found');
const nu = rowsOf(stats, UTIL).map((r) => r.machine_name).sort();
check(JSON.stringify(nu) === JSON.stringify(['N11', 'S06']), 'Nottingham time utilisation: only the machines of its list: ' + nu);

// 11. no glidepaths file for a site: nothing for that site, others unaffected
const noGlide = planLake();
noGlide.delete(`${REF}/glidepaths/site=Nottingham/Glidepath Notts.csv`);
stats = await run({ tables: STEP2, sites: ['Hull', 'Nottingham'], from: '2026-09', to: '2026-09' }, { lake: noGlide });
check(tableWrites(stats).every((p) => p.includes('site=Hull')) && tableWrites(stats).length === 2,
  'no glidepaths for a site: only the other site is written');
check(/FAILED, NOTHING WRITTEN: glidepaths Nottingham/.test(logText(stats)), 'no glidepaths: the log names the site');

// 12. dry run and one table
stats = await run({ tables: STEP2, sites: ['Hull'], from: '2026-09', to: '2026-09' }, { lake: planLake(), write: false });
check(tableWrites(stats).length === 0 && /DRY RUN: pbi_plan_opt 3 rows/.test(logText(stats)), 'plan dry run: nothing written, rows counted in the log');
stats = await run({ tables: ['pbi_time_utilisation'], sites: ['Hull'], from: '2026-09', to: '2026-09' }, { lake: planLake() });
check(JSON.stringify(tableWrites(stats)) === JSON.stringify([outPath('pbi_time_utilisation', 'Hull', '2026-09')]),
  'job with one table writes only that table');
stats = await run({ tables: STEP2, sites: ['Hull'], from: '2026-09', to: '2026-09' }, { lake: planLake(), listKeyPrefix: 'data/ten=reckitt/' });
check(tableWrites(stats).length === 2, 'plan: keys with the tenant folder are read');
stats = await run({ tables: STEP2, from: '2026-10', to: '2026-09' });
check(tableWrites(stats).length === 0 && stats.errors.some((e) => /from and to/.test(e)), 'from after to: error, nothing written');

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

// 7b. real plan OPT and time utilisation (optional): `real plan dir=<dir>`
// writes plan.json and util.json for a comparison with the report.
if (process.argv.includes('real') && process.argv.includes('plan')) {
  const root = new URL('../sharepoint/', import.meta.url);
  const lake = new Map();
  const load = (group, type) => {
    for (const site of readdirSync(new URL(`${group}/${type}/`, root))) {
      for (const f of readdirSync(new URL(`${group}/${type}/${site}/`, root))) {
        const key = `${group === 'reference' ? REF : SRC}/${type}/${site}/${f}`;
        lake.set(key, readFileSync(new URL(`${group}/${type}/${site}/${f}`, root), 'utf8'));
      }
    }
  };
  load('reference', 'glidepaths');
  load('reference', 'shift_naming');
  load('source', 'plan_opt');
  const real = await run({ tables: STEP2, from: '2024-12', to: '2026-10' }, { lake });
  console.log('real run: errors', real.errors.length, '| files', tableWrites(real).length);
  real.logs.filter((l) => /CHECK/.test(String(l))).forEach((l) => console.log('  ', String(l).slice(0, 260)));
  real.logs.filter((l) => !/CHECK/.test(String(l))).forEach((l) => console.log('   LOG', String(l).slice(0, 200)));
  const outDir = process.argv.find((a) => a.startsWith('dir='));
  if (outDir) {
    const dir = outDir.slice(4);
    writeFileSync(`${dir}/plan.json`, JSON.stringify(rowsOf(real, PLAN)));
    writeFileSync(`${dir}/util.json`, JSON.stringify(rowsOf(real, UTIL)));
  }
}

console.log(failures ? `${failures} check(s) FAILED` : 'all checks passed');
process.exit(failures ? 1 : 0);
