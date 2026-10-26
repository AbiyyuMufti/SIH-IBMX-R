// Offline test of flows/vfc-pbi-report.json: Plan_OPT_EU, Time_Utilisation_EU
// and Daily_Losses_EU with the machine columns, the split by line source.
// The data lake is a map in memory with small CSV files.
// Usage: node scripts/test-vfc-pbi-report.js platform=xcelerator
//   node scripts/test-vfc-pbi-report.js platform=xcelerator real plan dir=<dir>
//   (plan: also the real plan OPT month files, writes plan.json and util.json)
//   node scripts/test-vfc-pbi-report.js platform=xcelerator real loss from=2026-08 to=2026-09 dir=<dir>
//   (loss: the real daily losses of those months, writes loss.json)
//   real: reads the real files of sharepoint/ (local, git-ignored)
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { runFlow, testPlatform } from './lib-vfc-runner.js';

const read = (f) => JSON.parse(readFileSync(new URL('../flows/' + f, import.meta.url), 'utf8'));
const config = read('vfc-config.json');
const flow = read('vfc-pbi-report.json');
const REF = 'eu_report/reference';
const OUT = 'eu_report/report';
const CANDIDATE = 'eu_report/candidate/provideam';

let failures = 0;
const check = (ok, text) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + text);
  if (!ok) failures++;
};

// A small lake: the three Machine Names files, the Shift Patterns file and
// the report scope file of the repo (config/report_scope.csv).
const SCOPE_FILE = `${REF}/report_scope/site=All/report_scope.csv`;
const SCOPE_CSV = readFileSync(new URL('../config/report_scope.csv', import.meta.url), 'utf8');
const makeLake = () => new Map([
  [SCOPE_FILE, SCOPE_CSV],
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
const rawRowsOf = (stats, name) => (stats.parquetPayloads[name] || []).flat();
// The tables use the Tableau column names. Most checks below were written for
// the snake_case names of the first version: this adapter turns the rows back,
// so the same checks prove the content did not change (names and types of the
// Tableau columns are checked in section 13).
const dayText = (n) => (n === null ? null : new Date(n * 86400000).toISOString().slice(0, 10));
const timeText = (ms) => (ms === null ? null : new Date(ms).toISOString().slice(11, 19));
const RENAME = {
  'Write Plan_OPT_EU parquet': {
    Date: ['date', dayText], AreaName: 'area_name', MachineName: 'machine_name', ShiftName: 'shift_name',
    PartName: 'part_name', 'Good Parts': 'good_parts', Capacity: 'capacity', 'Total Time': 'total_time',
    'Planned OpT': 'planned_opt', 'OEE Time': 'oee_time', 'Downtime Units': 'downtime_units',
    SiteName: 'site_name', 'Unique Machine Name': 'unique_machine_name', 'Product Key': 'product_key',
    'UPDT Target': 'updt_target', 'PDT Target': 'pdt_target', 'OEE Target': 'oee_target',
    'In EU Report': 'in_eu'
  },
  'Write Time_Utilisation_EU parquet': {
    Date: ['date', dayText], MachineName: 'machine_name', 'OEE Time Total': 'oee_time_total',
    'Total Time Total': 'total_time_total', 'Planned OPT Total': 'planned_opt_total',
    SiteName: 'site_name', 'Unique Machine Name': 'unique_machine_name', 'All Time': 'all_time',
    'In EU Report': 'in_eu'
  },
  'Write Daily_Losses_EU parquet': {
    Date: ['date', dayText], Time: ['time', timeText], MachineName: 'machine_name', PartName: 'part_name',
    ShiftName: 'shift_name', OEELossLvl3Group: 'loss_lvl3_group', OEELossLvl3SubGroup: 'loss_lvl3_sub_group',
    OEELossLvl3Desc: 'loss_lvl3_desc', Duration: ['duration', (ms) => (ms === null ? null : Math.floor(ms / 60000))],
    SiteName: 'site_name', 'Unique Machine Name': 'unique_machine_name', 'Breakdown Types': 'breakdown_types',
    ShiftStartDate: ['shift_start_date', dayText], Comment: 'comment', 'Product Key': 'product_key',
    'Volume Key': 'volume_key', 'Loss Units': 'loss_units', Equipment: 'equipment',
    'Loss Target Key': 'loss_target_key', Value: ['value', (v) => (v === null ? null : Number(v))],
    'Volume Total': 'volume_total', 'Loss Final Level': 'loss_final_level',
    'In EU Report': 'in_eu'
  }
};
const rowsOf = (stats, name) => {
  const map = RENAME[name];
  const raw = rawRowsOf(stats, name);
  if (!map) {
    return raw;
  }
  return raw.map((row) => {
    const out = { ...row };
    Object.entries(map).forEach(([from, to]) => {
      const [key, convert] = Array.isArray(to) ? to : [to, (v) => v];
      out[key] = convert(row[from]);
    });
    return out;
  });
};
const logText = (stats) => stats.logs.map(String).join('\n');

let stats;
// 6. an unknown table is refused before anything runs (the reference tables
// pbi_machine_names, pbi_shift_naming and pbi_calendar are gone)
for (const table of ['pbi_nothing', 'pbi_machine_names', 'pbi_calendar']) {
  stats = await run({ tables: [table] });
  check(tableWrites(stats).length === 0 && stats.errors.some((e) => /unknown/.test(e)),
    `unknown table ${table}: error, nothing written`);
}

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
const STEP2 = ['Plan_OPT_EU', 'Time_Utilisation_EU'];
const PLAN = 'Write Plan_OPT_EU parquet';
const UTIL = 'Write Time_Utilisation_EU parquet';
const outPath = (table, site, month, out = OUT) =>
  `${out}/${table}/site=${site}/${table}_${month}_provideam.parquet`;

// 8. Hull, September 2026
stats = await run({ tables: STEP2, sites: ['Hull'], from: '2026-09', to: '2026-09' }, { lake: planLake() });
check(stats.errors.length === 0, 'plan: no error: ' + stats.errors.join(' | '));
check(JSON.stringify(tableWrites(stats).sort()) === JSON.stringify([
  outPath('Plan_OPT_EU', 'Hull', '2026-09'), outPath('Time_Utilisation_EU', 'Hull', '2026-09')]),
  'plan: one file per table, site and month: ' + tableWrites(stats).join(', '));

// 8b. A site whose reportSource is sih: the Provideam months go to the
// candidate folder, nothing to report/.
{
  const sihConfig = config.map((n) => (n.type === 'function'
    ? { ...n, func: n.func.replace("reportSource: 'provideam'", "reportSource: 'sih'") } : n));
  const cand = await run({ tables: STEP2, sites: ['Hull'], from: '2026-09', to: '2026-09' },
    { lake: planLake(), configNodes: sihConfig });
  const files = cand.written.filter((p) => !p.includes('/logs/')).sort();
  check(JSON.stringify(files) === JSON.stringify([
    outPath('Plan_OPT_EU', 'Hull', '2026-09', CANDIDATE),
    outPath('Time_Utilisation_EU', 'Hull', '2026-09', CANDIDATE)]),
  'reportSource sih: the Provideam months of Hull go to candidate/provideam: ' + files.join(', '));
}
let plan = rowsOf(stats, PLAN);
check(plan.length === 5, `plan rows 5 (GT4 - Auto and the blank machine are left out): ${plan.length}`);
check(JSON.stringify(plan.filter((r) => !r.in_eu).map((r) => r.machine_name).sort()) ===
  JSON.stringify(['4 Tonne', 'Bosch Capsulator ']),
'scope: 4 Tonne and Bosch Capsulator (trailing space in the source) are In EU Report false, the rest true');
plan = plan.filter((r) => r.in_eu);
check(/In EU Report false: 2 rows/.test(logText(stats)), 'scope: the log counts the rows outside the EU report');
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
const util = rowsOf(stats, UTIL).filter((r) => r.in_eu);
const u1 = util.find((r) => r.date === '2026-09-01');
check(util.length === 2 && u1.machine_name === 'B2 Auto', 'time utilisation: one row per machine and day: ' + util.length);
check(Math.abs(u1.total_time_total - 750.5) < 1e-9 && Math.abs(u1.planned_opt_total - 721.25) < 1e-9 &&
  Math.abs(u1.oee_time_total - (260 + 59 / 60 + 60)) < 1e-9,
  'time utilisation: sums of minutes with seconds (600 + 150.5, 570.75 + 150.5, 260.98 + 60)');
check(u1.all_time === 1440 && u1.unique_machine_name === 'B2 Auto-Hull', 'time utilisation: All Time 1440, unique name');

// 9. months of the job: a missing month is skipped, an existing one is built
stats = await run({ tables: STEP2, sites: ['Hull'], from: '2026-08', to: '2026-10' }, { lake: planLake() });
check(JSON.stringify(tableWrites(stats).sort()) === JSON.stringify([
  outPath('Plan_OPT_EU', 'Hull', '2026-09'), outPath('Plan_OPT_EU', 'Hull', '2026-10'),
  outPath('Time_Utilisation_EU', 'Hull', '2026-09'), outPath('Time_Utilisation_EU', 'Hull', '2026-10')]),
  'months: 2026-09 and 2026-10 built, 2026-08 has no file');
check(/no plan_opt file for 2026-08, skipped/.test(logText(stats)), 'months: the missing month is logged');
const oct = rowsOf(stats, PLAN).find((r) => r.date === '2026-10-03');
check(oct.oee_target === null && oct.pdt_target === 13 && oct.updt_target === null,
  'targets: an empty glidepath cell gives an empty target, a filled one is kept');

// 10. Nottingham rules
stats = await run({ tables: STEP2, sites: ['Nottingham'], from: '2026-09', to: '2026-09' }, { lake: planLake() });
plan = rowsOf(stats, PLAN);
check(JSON.stringify(plan.map((r) => r.machine_name).sort()) === JSON.stringify(['N11', 'S06', 'S07', 'S14', 'X99']),
  'Nottingham plan: only N11 Auto is left out: ' + plan.map((r) => r.machine_name));
check(JSON.stringify(plan.filter((r) => r.in_eu).map((r) => r.machine_name).sort()) === JSON.stringify(['N11', 'S06', 'S07']),
  'Nottingham plan scope: the two packing areas (with or without the leading space), not S14: ' +
  plan.filter((r) => r.in_eu).map((r) => r.machine_name));
check(plan.find((r) => r.machine_name === 'S06').area_name === ' Strepsils Packing' &&
  plan.find((r) => r.machine_name === 'S06').oee_target === 40, 'Nottingham plan: the area keeps its leading space, target found');
const nu = rowsOf(stats, UTIL).filter((r) => r.in_eu).map((r) => r.machine_name).sort();
check(JSON.stringify(nu) === JSON.stringify(['N11', 'S06']), 'Nottingham time utilisation scope: only the machines of its list: ' + nu);
check(rowsOf(stats, UTIL).length === 5, 'Nottingham time utilisation: every machine but N11 Auto has rows');

// 11. no glidepaths file for a site: nothing for that site, others unaffected
const noGlide = planLake();
noGlide.delete(`${REF}/glidepaths/site=Nottingham/Glidepath Notts.csv`);
stats = await run({ tables: STEP2, sites: ['Hull', 'Nottingham'], from: '2026-09', to: '2026-09' }, { lake: noGlide });
check(tableWrites(stats).every((p) => p.includes('site=Hull')) && tableWrites(stats).length === 2,
  'no glidepaths for a site: only the other site is written');
check(/FAILED, NOTHING WRITTEN: glidepaths Nottingham/.test(logText(stats)), 'no glidepaths: the log names the site');

// 12. dry run and one table
stats = await run({ tables: STEP2, sites: ['Hull'], from: '2026-09', to: '2026-09' }, { lake: planLake(), write: false });
check(tableWrites(stats).length === 0 && /DRY RUN: Plan_OPT_EU 5 rows/.test(logText(stats)), 'plan dry run: nothing written, rows counted in the log');
stats = await run({ tables: ['Time_Utilisation_EU'], sites: ['Hull'], from: '2026-09', to: '2026-09' }, { lake: planLake() });
check(JSON.stringify(tableWrites(stats)) === JSON.stringify([outPath('Time_Utilisation_EU', 'Hull', '2026-09')]),
  'job with one table writes only that table');
stats = await run({ tables: STEP2, sites: ['Hull'], from: '2026-09', to: '2026-09' }, { lake: planLake(), listKeyPrefix: 'data/ten=reckitt/' });
check(tableWrites(stats).length === 2, 'plan: keys with the tenant folder are read');
stats = await run({ tables: STEP2, from: '2026-10', to: '2026-09' });
check(tableWrites(stats).length === 0 && stats.errors.some((e) => /from and to/.test(e)), 'from after to: error, nothing written');

// ---- step 3: daily losses (synthetic month files) ----
const LOSS_HEAD = 'SiteName,StartTime,MachineName,PartName,ShiftName,OEELossLvl3Group,OEELossLvl3SubGroup,OEELossLvl3Desc,Duration,ShiftStartDate,Comment';
const lossRow = (site, start, machine, part, shift, group, sub, desc, duration, day, comment) =>
  [site, start, machine, part, shift, group, sub, desc, duration, day, comment]
    .map((v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',');
const lossLake = () => {
  const lake = planLake();
  lake.set(`${SRC}/line_losses/site=Hull/line_losses_2026-09.csv`, [
    LOSS_HEAD,
    lossRow('Hull', '2026-09-01 08:15:00', 'B2 Auto', 'NFC 12 X 100ML ', 'FriDay', 'Unplanned Loss', 'Breakdown - Mechanical', 'Capper', '00:30:45', '2026-09-01', 'jam, cleared'),
    lossRow('Hull', '2026-09-01 08:15:00', 'B2 Auto', 'NFC 12 X 100ML ', 'FriDay', 'Unplanned Loss', 'Breakdown - Mechanical', 'Capper', '00:30:45', '2026-09-01', 'same start, dropped'),
    lossRow('Hull', '2026-09-01 10:00:00', 'B2 Auto', 'NFC 12 X 100ML ', 'FriDay', 'Planned Loss', 'Meals & Breaks', 'Breaks', '01:00:00', '2026-09-01', ''),
    lossRow('Hull', '2026-09-01 11:00:00', 'B2 Auto', 'NFC 12 X 100ML ', 'FriDay', 'Micro Stoppage', 'Other', 'Tiny', '00:01:00', '2026-09-01', ''),
    lossRow('Hull', '2026-09-01 11:30:00', '4 Tonne', 'Bulk', 'FriDay', 'Unplanned Loss', 'Other', 'X', '00:10:00', '2026-09-01', ''),
    lossRow('Hull', '2026-09-01 11:40:00', 'B1 - Auto', 'Bulk', 'FriDay', 'Unplanned Loss', 'Other', 'X', '00:10:00', '2026-09-01', ''),
    lossRow('Hull', '2026-09-01 12:00:00', 'B2 Auto', 'NFC 12 X 100ML ', 'Mystery Shift', 'Unplanned Loss', 'Minor stop', 'Jam', '00:05:00', '2026-09-01', ''),
    lossRow('Hull', '2026-09-02 07:00:00', 'B2 Auto', 'NFC 12 X 100ML ', 'FriDay', 'Unplanned Loss', 'Lack of resources', 'No staff', '00:20:00', '2026-09-02', ''),
    ''
  ].join('\n'));
  lake.set(`${SRC}/volume_loss_correction/site=Hull/volume_loss_correction_2026-09.csv`, [
    'ShiftStartDate,MachineName,OEELossLvl3Group,OEELossLvl3SubGroup,OEELossLvl3Desc,Time,Loss Units',
    'Hull,x',
    ''
  ].join('\n').replace('Hull,x\n', '2026-09-01,B2 Auto,Unplanned Loss,Breakdown,Capper,03:00:00,9000.40\n2026-09-01,B2 Auto,Planned Loss,Meals & Breaks,Breaks,02:00:00,600.00\n'));
  lake.set(`${REF}/equipment_coding/site=Hull/Hull_Equipment.csv`, [
    'MachineName,OEELossLvl3Desc,Merged Unique Identifier,Equipment,Lvl 3 Loss Name',
    '4 Tonne,Not Logged,4 Tonne Not Logged,,',
    'B2 Auto,Capper,B2 Auto Capper,Capper Head,Capper',
    'B2 Auto,Breaks,B2 Auto Breaks,,Breaks',
    'B2 Auto,Jam,B2 Auto Jam,Filler,Jam',
    'B2 Auto,Jam,B2 Auto Jam,Labeller,Jam',
    ''
  ].join('\n'));
  lake.set(`${REF}/glidepaths/site=Hull/Glidepath Hull.csv`, [
    '﻿Site Name,Line,OEE Bucket,01/08/2026,01/09/2026,01/10/2026',
    glide('Hull', 'B2 Auto', '% OEE', ['50.5', '56.1', '']),
    glide('Hull', 'B2 Auto', 'Planned Downtime (Total)', ['10', '12.5', '13']),
    glide('Hull', 'B2 Auto', 'Unplanned Downtime (Total)', ['20', '21.5', '']),
    glide('Hull', 'B2 Auto', 'Breakdown', ['1', '2', '3']),
    glide('Hull', 'B2 Auto', 'Minor Stops', ['4', '5', '6']),
    glide('Hull', 'B2 Auto', 'Lack Of Resources', ['7', '8', '9']),
    ''
  ].join('\n'));
  // Nottingham and Weinheim
  lake.set(`${SRC}/line_losses/site=Nottingham/line_losses_2026-09.csv`, [
    LOSS_HEAD,
    lossRow('Nottingham', '2026-09-01 09:00:00', 'S06', 'Lozenge 24', 'MonDay', 'Planned Losses', 'Breaks and Meals', 'Lunch', '00:45:00', '2026-09-01', ''),
    lossRow('Nottingham', '2026-09-01 09:30:00', 'Bosch', 'X', 'MonDay', 'Unplanned Losses', 'Minor Stop', 'X', '00:05:00', '2026-09-01', ''),
    ''
  ].join('\n'));
  lake.set(`${REF}/equipment_coding/site=Nottingham/Notts_Equipment.csv`, [
    'MachineName,OEELossLvl3Desc,Merged Unique Identifier,Equipment,Lvl 3 Loss Name', 'S06,Lunch,S06 Lunch,Cooler,Lunch', ''
  ].join('\n'));
  lake.set(`${SRC}/line_losses/site=Weinheim/line_losses_2026-09.csv`, [
    LOSS_HEAD,
    lossRow('Weinheim', '2026-09-01 07:00:00', 'Line 4', '3011627 SDENT,PURETE,FR', 'MonDay', 'Planned Losses', 'Meals&Breaks', 'Pause', '00:30:00', '2026-09-01', ''),
    lossRow('Weinheim', '2026-09-01 08:00:00', 'Line 4', '3011627 SDENT,PURETE,FR', 'MonDay', 'Run', 'Run', 'Run', '03:00:00', '2026-09-01', ''),
    ''
  ].join('\n'));
  lake.set(`${REF}/equipment_coding/site=Weinheim/Wein_Equipment_Map.csv`, [
    'MachineName,OEELossLvl3Desc,Equipment,Lvl 3 Loss Name', 'Line 4,Pause,Packer,Pause', ''
  ].join('\n'));
  lake.set(`${REF}/glidepaths/site=Weinheim/Glidepath Wein.csv`, [
    'Site Name,Line,OEE Bucket,01/09/2026', glide('Weinheim', 'Line 4', 'Breaks / Meals', ['3.5']), ''
  ].join('\n'));
  lake.set(`${REF}/glidepaths/site=Nottingham/Glidepath Notts.csv`, [
    'Site Name,Line,OEE Bucket,01/09/2026', glide('Nottingham', 'S06', '% OEE', ['40']), glide('Nottingham', 'S06', 'Breaks / Meals', ['2']), ''
  ].join('\n'));
  return lake;
};
const LOSS = 'Write Daily_Losses_EU parquet';
const lossJob = (sites) => ({ tables: ['Daily_Losses_EU'], sites, from: '2026-09', to: '2026-09' });

stats = await run(lossJob(['Hull']), { lake: lossLake() });
check(stats.errors.length === 0, 'losses: no error: ' + stats.errors.join(' | '));
check(JSON.stringify(tableWrites(stats)) === JSON.stringify([outPath('Daily_Losses_EU', 'Hull', '2026-09')]),
  'losses: one file per site and month: ' + tableWrites(stats).join(', '));
let loss = rowsOf(stats, LOSS);
check(loss.length === 6, `losses: 6 rows (duplicate start, Micro Stoppage and B1 - Auto are left out; the duplicate equipment key doubles one row): ${loss.length}`);
check(loss.filter((r) => !r.in_eu).map((r) => r.machine_name).join() === '4 Tonne', 'losses scope: 4 Tonne is In EU Report false');
loss = loss.filter((r) => r.in_eu);
const cap = loss.find((r) => r.loss_lvl3_desc === 'Capper');
check(cap.loss_lvl3_sub_group === 'Breakdown' && cap.breakdown_types === 'Breakdown - Mechanical',
  'losses: subgroup Breakdown, the raw subgroup kept in breakdown_types: ' + cap.loss_lvl3_sub_group);
check(cap.duration === 30 && cap.date === '2026-09-01' && cap.time === '08:15:00' && cap.shift_start_date === '2026-09-01',
  `losses: duration in whole minutes (00:30:45 gives 30), date and time: ${cap.duration} ${cap.date} ${cap.time}`);
check(Math.abs(cap.loss_units - 9000 * 30 / 180) < 1e-9, 'losses: loss units = correction units (rounded) x duration / correction minutes: ' + cap.loss_units);
check(cap.equipment === 'Capper Head' && cap.shift_name === 'Day',
  'losses: equipment, mapped shift and the raw shift name');
check(cap.value === 2 && Math.abs(cap.target - 0.02) < 1e-9 && cap.loss_target_key === 'B2 Auto-Hull Breakdown 01/09/2026',
  'losses: loss target key and value from the Glidepaths bucket, target = value / 100');
check(cap.volume_total === 2500.5, 'losses: volume total = sum of Capacity of the machine and day');
check(cap.volume_key === '01/09/2026 B2 Auto Unplanned Loss Breakdown Capper',
  'losses: volume key as the report builds it: ' + cap.volume_key);
check(cap.comment === 'jam, cleared' && cap.product_key === 'B2 Auto-Hull NFC 12 X 100ML' && cap.part_name === 'NFC 12 X 100ML',
  'losses: comment text kept, trailing spaces of the part name removed (the report has none)');
const noComment = loss.find((r) => r.loss_lvl3_desc === 'Breaks');
check(noComment && noComment.comment === null, 'losses: an empty comment is a null (the report has null, not an empty text)');
const brk = loss.find((r) => r.loss_lvl3_desc === 'Breaks');
check(brk.loss_lvl3_sub_group === 'Breaks / Meals' && brk.equipment === 'Unclassed', 'losses: Meals & Breaks becomes Breaks / Meals, an empty equipment is Unclassed');
check(Math.abs(brk.loss_units - 600 * 60 / 120) < 1e-9, 'losses: a second correction row: 600 x 60 / 120');
const minor = loss.filter((r) => r.loss_lvl3_desc === 'Jam');
check(minor.length === 2 && minor.map((r) => r.equipment).sort().join() === 'Filler,Labeller',
  'losses: a duplicate key in the equipment file doubles the row, as the report join does: ' + minor.length);
const minorRow = loss.find((r) => r.loss_lvl3_group === 'Unplanned Loss' && r.time === '12:00:00');
check(minorRow.loss_lvl3_sub_group === 'Minor Stops' && minorRow.loss_units === null && minorRow.shift_name === null,
  'losses: Text.Proper and the list give Minor Stops, no correction gives no loss units, an unknown shift is empty');
const lack = loss.find((r) => r.date === '2026-09-02');
check(lack.loss_lvl3_sub_group === 'Lack Of Resources' && lack.value === 8, 'losses: Lack of resources becomes Lack Of Resources, target found: ' + lack.loss_lvl3_sub_group);
check(/CHECK Hull 2026-09: read 8 rows, kept 6/.test(logText(stats)) && /duplicate starts 1/.test(logText(stats)), 'losses: the check log counts rows and duplicates');

stats = await run(lossJob(['Nottingham']), { lake: lossLake() });
loss = rowsOf(stats, LOSS);
check(loss.length === 2 && loss.filter((r) => r.in_eu).map((r) => r.machine_name).join() === 'S06',
  'Nottingham losses: Bosch is kept, In EU Report false: ' + loss.map((r) => r.machine_name + ' ' + r.in_eu));
loss = loss.filter((r) => r.in_eu);
check(loss[0].loss_lvl3_group === 'Planned Loss' && loss[0].loss_lvl3_sub_group === 'Breaks / Meals' && loss[0].equipment === 'Cooler',
  'Nottingham losses: group Planned Losses becomes Planned Loss, Breaks and Meals becomes Breaks / Meals: ' + loss[0].loss_lvl3_sub_group);
check(loss[0].value === 2 && loss[0].breakdown_types === 'Breaks and Meals', 'Nottingham losses: target by subgroup, raw subgroup in breakdown_types');

stats = await run(lossJob(['Weinheim']), { lake: lossLake() });
loss = rowsOf(stats, LOSS);
check(loss.length === 2, 'Weinheim losses: no group filter, the Run row stays: ' + loss.length);
const wp = loss.find((r) => r.loss_lvl3_desc === 'Pause');
check(wp.part_name === 'SDENT,PURETE,FR' && wp.breakdown_types === null, 'Weinheim losses: the first 8 characters of the part name are cut, no breakdown types');
check(wp.loss_lvl3_group === 'Planned Loss' && wp.loss_lvl3_sub_group === 'Breaks / Meals' && wp.equipment === 'Packer' && wp.value === 3.5,
  'Weinheim losses: Planned Losses and Meals&Breaks mapped, equipment key built from machine and description: ' + wp.loss_lvl3_sub_group);

const noVc = lossLake();
noVc.delete(`${SRC}/volume_loss_correction/site=Hull/volume_loss_correction_2026-09.csv`);
noVc.delete(`${SRC}/plan_opt/site=Hull/plan_opt_2026-09.csv`);
stats = await run(lossJob(['Hull']), { lake: noVc });
loss = rowsOf(stats, LOSS);
check(loss.length === 6 && loss.every((r) => r.loss_units === null && r.volume_total === null),
  'losses: without a correction and a plan OPT file the rows are still built, loss units and volume total empty');
const noEq = lossLake();
noEq.delete(`${REF}/equipment_coding/site=Hull/Hull_Equipment.csv`);
stats = await run(lossJob(['Hull', 'Weinheim']), { lake: noEq });
check(tableWrites(stats).length === 1 && /FAILED, NOTHING WRITTEN: equipment_coding Hull/.test(logText(stats)),
  'losses: no equipment file for a site: that site is skipped and logged, the other is built');
stats = await run(lossJob(['Hull']), { lake: lossLake(), write: false });
check(tableWrites(stats).length === 0 && /DRY RUN: Daily_Losses_EU 6 rows/.test(logText(stats)), 'losses dry run: nothing written');
stats = await run({ tables: ['Plan_OPT_EU', 'Daily_Losses_EU'], sites: ['Hull'], from: '2026-09', to: '2026-09' }, { lake: lossLake() });
check(tableWrites(stats).length === 2, 'plan OPT and losses in one job: both written (the shared setup is run once per site)');

// ---- 13. the column names and types of the Tableau data sources ----
// Names and order of the extracts Plan_OPT_EU, Time_Utilisation_EU and
// Daily_Losses_EU (with Dept, Area, Product Type), then Data Source and our
// own extra columns. Merged, ShiftName - Copy, Volume Key.1 are left out.
const TABLEAU = {
  [PLAN]: [
    ['Date', 'DATE'], ['AreaName', 'UTF8'], ['MachineName', 'UTF8'], ['ShiftName', 'UTF8'],
    ['PartName', 'UTF8'], ['Good Parts', 'INT64'], ['Capacity', 'DOUBLE'], ['Total Time', 'INT64'],
    ['Planned OpT', 'INT64'], ['OEE Time', 'INT64'], ['Downtime Units', 'DOUBLE'], ['SiteName', 'UTF8'],
    ['Unique Machine Name', 'UTF8'], ['Product Key', 'UTF8'], ['UPDT Target', 'DOUBLE'],
    ['PDT Target', 'DOUBLE'], ['OEE Target', 'DOUBLE'], ['Dept', 'UTF8'], ['Area', 'UTF8'], ['Product Type', 'UTF8'], ['Data Source', 'UTF8'], ['In EU Report', 'BOOLEAN'], ['source_hours', 'INT64'],
    ['loaded_at', 'TIMESTAMP_MILLIS']
  ],
  [UTIL]: [
    ['Date', 'DATE'], ['MachineName', 'UTF8'], ['OEE Time Total', 'DOUBLE'], ['Total Time Total', 'DOUBLE'],
    ['Planned OPT Total', 'DOUBLE'], ['SiteName', 'UTF8'], ['Unique Machine Name', 'UTF8'],
    ['All Time', 'INT64'], ['Dept', 'UTF8'], ['Area', 'UTF8'], ['Product Type', 'UTF8'], ['Data Source', 'UTF8'], ['In EU Report', 'BOOLEAN'], ['loaded_at', 'TIMESTAMP_MILLIS']
  ],
  [LOSS]: [
    ['Date', 'DATE'], ['Time', 'TIMESTAMP_MILLIS'], ['MachineName', 'UTF8'], ['PartName', 'UTF8'],
    ['Shift Time', 'UTF8'], ['ShiftName', 'UTF8'], ['OEELossLvl3Group', 'UTF8'],
    ['OEELossLvl3SubGroup', 'UTF8'], ['OEELossLvl3Desc', 'UTF8'], ['Duration', 'TIMESTAMP_MILLIS'],
    ['SiteName', 'UTF8'], ['Unique Machine Name', 'UTF8'], ['Breakdown Types', 'UTF8'],
    ['ShiftStartDate', 'DATE'], ['Comment', 'UTF8'], ['Product Key', 'UTF8'], ['Volume Key', 'UTF8'],
    ['Loss Units', 'DOUBLE'], ['Time in Mins', 'DOUBLE'], ['Equipment Loss Key', 'UTF8'],
    ['Equipment', 'UTF8'], ['Lvl 3 Loss Name', 'UTF8'], ['Loss Target Key', 'UTF8'], ['Value', 'UTF8'],
    ['Volume Total', 'DOUBLE'], ['Loss Final Level', 'UTF8'], ['Dept', 'UTF8'], ['Area', 'UTF8'], ['Product Type', 'UTF8'], ['Data Source', 'UTF8'], ['In EU Report', 'BOOLEAN'], ['target', 'DOUBLE'], ['batch_id', 'UTF8'],
    ['comment_count', 'INT64'], ['loaded_at', 'TIMESTAMP_MILLIS']
  ]
};
Object.entries(TABLEAU).forEach(([node, expected]) => {
  const parquet = flow.find((n) => n.type === 'parquet' && n.name === node);
  const have = parquet.columns.map((c) => [c.column, c.type]);
  check(JSON.stringify(have) === JSON.stringify(expected), `${node}: column names, order and types of the Tableau source`);
});
const dropped = ['Merged', 'ShiftName - Copy', 'Volume Key.1'];
check(!flow.some((n) => n.type === 'parquet' && (n.columns || []).some((c) => dropped.includes(c.column))),
  'Merged, ShiftName - Copy and Volume Key.1 are not written');

stats = await run({ tables: [...STEP2, 'Daily_Losses_EU'], sites: ['Hull'], from: '2026-09', to: '2026-09' },
  { lake: lossLake() });
check(stats.errors.length === 0, 'tableau names: no error: ' + stats.errors.join(' | '));
Object.keys(TABLEAU).forEach((node) => {
  const names = TABLEAU[node].map(([c]) => c).sort();
  const rows = rawRowsOf(stats, node);
  check(rows.length > 0 && rows.every((r) => JSON.stringify(Object.keys(r).sort()) === JSON.stringify(names)),
    `${node}: every row has exactly the columns of the schema (${rows.length} rows)`);
});
const planRaw = rawRowsOf(stats, PLAN).find((r) => r.PartName.startsWith('NFC') && r.Date === 20697);
check(planRaw['Total Time'] === 600 && planRaw['Good Parts'] === 1500 && planRaw['Planned OpT'] === 570,
  'tableau plan row: Date is a day number (20697 = 2026-09-01), whole-number columns');
const lossRaw = rawRowsOf(stats, LOSS).find((r) => r.OEELossLvl3Desc === 'Capper');
check(lossRaw.Date === 20697 && lossRaw.ShiftStartDate === 20697 && lossRaw.Time === 29700000,
  'tableau loss row: Date and ShiftStartDate are day numbers, Time is the ms of the day (08:15:00)');
check(lossRaw.Duration === 1845000 && lossRaw['Time in Mins'] === 30.75,
  'tableau loss row: Duration and Time in Mins keep the seconds (00:30:45)');
check(lossRaw['Shift Time'] === 'Day' && lossRaw.ShiftName === 'Day' && lossRaw['Equipment Loss Key'] === 'B2 Auto Capper' &&
  lossRaw['Lvl 3 Loss Name'] === 'Capper' && lossRaw['Loss Final Level'] === 'Capper' && lossRaw.Value === '2.0',
  'tableau loss row: Shift Time, Equipment Loss Key, Lvl 3 Loss Name, Value as text with a decimal point (2.0)');

// ---- 14. machine columns and the split by line source ----
const HULL_MN = `${REF}/machine_names/site=Hull/Hull_MachineNames.csv`;
const PLAN_JOB = { tables: ['Plan_OPT_EU'], sites: ['Hull'], from: '2026-09', to: '2026-09' };
stats = await run(PLAN_JOB, { lake: planLake() });
let raw = rawRowsOf(stats, PLAN).filter((r) => r.MachineName === 'B2 Auto');
check(raw.length === 3 && raw.every((r) => r.Dept === 'Liquids Pack' && r.Area === 'Liquids' &&
  r['Product Type'] === 'Bottles' && r['Data Source'] === 'Provideam'),
'machine columns: Dept, Area, Product Type from the Machine Names file, Data Source Provideam');
{
  const lake = planLake();
  lake.set(HULL_MN, 'MachineName,Dept,Area,Product Type\nGT4,Dries Pack,Dries,Blisters\n');
  stats = await run(PLAN_JOB, { lake });
  raw = rawRowsOf(stats, PLAN).filter((r) => r.MachineName === 'B2 Auto');
  check(raw.length === 3 && raw.every((r) => r.Dept === null && r['Product Type'] === null) &&
    /not in Machine Names[^\n]*B2 Auto/.test(logText(stats)),
  'machine columns: a machine not in the file gets empty columns and a log note');
}
{
  const lake = planLake();
  lake.delete(HULL_MN);
  stats = await run(PLAN_JOB, { lake });
  check(tableWrites(stats).length === 0 && /no csv file in eu_report\/reference\/machine_names\/site=Hull/.test(logText(stats)),
    'no Machine Names file: nothing for the site, the log names the folder');
}
{
  const lake = planLake();
  const old = `${REF}/machine_names/site=Hull/Old.csv`;
  lake.set(old, 'MachineName,Dept,Area,Product Type\nB2 Auto,Liquids Pack,Old,Old\n');
  stats = await run(PLAN_JOB, {
    lake, lakeTimes: { [old]: '2025-01-01T00:00:00.000Z', [HULL_MN]: '2026-10-01T00:00:00.000Z' }
  });
  check(rawRowsOf(stats, PLAN).filter((r) => r.MachineName === 'B2 Auto').every((r) => r.Area === 'Liquids'),
    'two Machine Names files: the newest one is read');
}
stats = await run(PLAN_JOB, { lake: planLake(), listKeyPrefix: '/' });
check(tableWrites(stats).length === 1, 'keys with a leading slash are read');
{
  // B2 line switched to sih in Config, GT4 stays on the site source.
  const lake = planLake();
  const file = `${SRC}/plan_opt/site=Hull/plan_opt_2026-09.csv`;
  lake.set(file, lake.get(file) + planRow('Hull', '2026-09-01', 'Hull Dries', 'GT4', 'FriDay', 'X', 5, '1.00',
    '08:00:00', '08:00:00', '08:00:00', '0.00') + '\n');
  const mixed = config.map((n) => (n.type === 'function'
    ? { ...n, func: n.func.replace("report: 'B2 Auto',", "report: 'B2 Auto',\n reportSource: 'sih',") } : n));
  stats = await run(PLAN_JOB, { lake, configNodes: mixed });
  const files = stats.written.filter((p) => !p.includes('/logs/')).sort();
  check(JSON.stringify(files) === JSON.stringify([
    outPath('Plan_OPT_EU', 'Hull', '2026-09', CANDIDATE), outPath('Plan_OPT_EU', 'Hull', '2026-09')]),
  'line on sih: two files of the month, report/ and candidate/provideam: ' + files.join(', '));
  const parts = stats.parquetPayloads[PLAN].map((rows) => rows.map((r) => r.MachineName).join());
  check(JSON.stringify(parts.sort()) === JSON.stringify(['4 Tonne,Bosch Capsulator ,GT4', 'B2 Auto,B2 Auto,B2 Auto']),
    'line on sih: the B2 Auto rows go to candidate, GT4 stays in report');
  check(/to eu_report\/candidate\/provideam: B2 Auto/.test(logText(stats)), 'line on sih: the log names the moved line');
}

// ---- 15. the report scope file ----
{
  const lake = planLake();
  lake.delete(SCOPE_FILE);
  stats = await run(PLAN_JOB, { lake });
  check(tableWrites(stats).length === 0 && /no csv file in eu_report\/reference\/report_scope\/site=All/.test(logText(stats)),
    'no report scope file: nothing is written, the log names the folder');
}
{
  const lake = planLake();
  lake.set(SCOPE_FILE, 'Site,Tables,Rule,Column,Value,Why\nHull,Plan_OPT_EU;Daily_Losses_EU,keep,MachineName,B2 Auto,test\n');
  stats = await run({ ...PLAN_JOB, tables: ['Plan_OPT_EU', 'Time_Utilisation_EU'] }, { lake });
  const inEu = rawRowsOf(stats, PLAN).filter((r) => r['In EU Report']).map((r) => r.MachineName);
  check(inEu.length === 3 && inEu.every((m) => m === 'B2 Auto'), 'scope keep rule: only the kept machine is In EU Report');
  check(rawRowsOf(stats, UTIL).every((r) => r['In EU Report'] === true), 'scope: a table without rules is fully In EU Report');
}
{
  const lake = planLake();
  lake.set(SCOPE_FILE, 'Site,Tables\n');
  stats = await run(PLAN_JOB, { lake });
  check(tableWrites(stats).length === 0 && /report scope: no Tables/.test(logText(stats)),
    'scope file without rules: the site fails, the log says why');
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
  load('reference', 'machine_names');
  lake.set(SCOPE_FILE, SCOPE_CSV);
  load('source', 'plan_opt');
  const real = await run({ tables: STEP2, from: '2024-12', to: '2026-10' }, { lake });
  console.log('real run: errors', real.errors.length, '| files', tableWrites(real).length);
  real.logs.filter((l) => /CHECK/.test(String(l))).forEach((l) => console.log('  ', String(l).slice(0, 260)));
  real.logs.filter((l) => !/CHECK/.test(String(l))).forEach((l) => console.log('   LOG', String(l).slice(0, 200)));
  const outDir = process.argv.find((a) => a.startsWith('dir='));
  if (outDir) {
    const dir = outDir.slice(4);
    writeFileSync(`${dir}/plan.json`, JSON.stringify(rawRowsOf(real, PLAN)));
    writeFileSync(`${dir}/util.json`, JSON.stringify(rawRowsOf(real, UTIL)));
  }
}

// 7c. real daily losses (optional): `real loss from=2026-08 to=2026-09 dir=<dir>`
// loads the month files of that range and writes loss.json.
if (process.argv.includes('real') && process.argv.includes('loss')) {
  const arg = (name, fallback) => {
    const a = process.argv.find((x) => x.startsWith(name + '='));
    return a ? a.slice(name.length + 1) : fallback;
  };
  const from = arg('from', '2026-09');
  const to = arg('to', '2026-09');
  const sites = arg('sites', 'Hull,Nottingham,Weinheim').split(',');
  const root = new URL('../sharepoint/', import.meta.url);
  const lake = new Map();
  const load = (group, type, filter) => {
    for (const site of readdirSync(new URL(`${group}/${type}/`, root))) {
      for (const f of readdirSync(new URL(`${group}/${type}/${site}/`, root))) {
        const month = (/_(\d{4}-\d{2})\.csv$/.exec(f) || [])[1];
        if (filter && (!month || month < from || month > to)) {
          continue;
        }
        const key = `${group === 'reference' ? REF : SRC}/${type}/${site}/${f}`;
        lake.set(key, readFileSync(new URL(`${group}/${type}/${site}/${f}`, root), 'utf8'));
      }
    }
  };
  load('reference', 'glidepaths');
  load('reference', 'shift_naming');
  load('reference', 'machine_names');
  load('reference', 'equipment_coding');
  lake.set(SCOPE_FILE, SCOPE_CSV);
  for (const type of ['plan_opt', 'line_losses', 'volume_loss_correction']) {
    load('source', type, true);
  }
  const real = await run({ tables: ['Daily_Losses_EU'], sites, from, to }, { lake });
  console.log('real loss run: errors', real.errors.length, '| files', tableWrites(real).length);
  real.logs.forEach((l) => console.log('  ', String(l).slice(0, 420)));
  const outDir = process.argv.find((a) => a.startsWith('dir='));
  if (outDir) {
    writeFileSync(`${outDir.slice(4)}/loss.json`, JSON.stringify(rawRowsOf(real, 'Write Daily_Losses_EU parquet')));
  }
}

console.log(failures ? `${failures} check(s) FAILED` : 'all checks passed');
process.exit(failures ? 1 : 0);
