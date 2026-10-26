// Offline test of flows/vfc-pbi-report-2.json: Run_Rates_EU, Volume_CoV_EU
// and Format_List_EU. The data lake is a map in memory with small CSV files.
// Usage: node scripts/test-vfc-pbi-report-2.js platform=xcelerator
//   node scripts/test-vfc-pbi-report-2.js platform=xcelerator real dir=<dir>
//   real: the real files of sharepoint/ (local, git-ignored), Aug and Sep
//   2026, writes run_rates.json, cov.json and format.json to <dir> for
//   scripts/helper-check-report-2.py (comparison with the EU report tables)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { runFlow, testPlatform } from './lib-vfc-runner.js';

const read = (f) => JSON.parse(readFileSync(new URL('../flows/' + f, import.meta.url), 'utf8'));
const config = read('vfc-config.json');
const flow = read('vfc-pbi-report-2.json');
const REF = 'eu_report/reference';
const SRC = 'eu_report/pbi_report/source';
const OUT = 'eu_report/report';
const RR = 'Write Run_Rates_EU parquet';
const COV = 'Write Volume_CoV_EU parquet';
const FMT = 'Write Format_List_EU parquet';

let failures = 0;
const check = (ok, text) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + text);
  if (!ok) failures++;
};

const SCOPE_CSV = readFileSync(new URL('../config/report_scope.csv', import.meta.url), 'utf8');
const RR_HEAD = 'SiteName,AreaName,MachineName,YYYY-MM-DD HH,PartName,ShiftName,Good Parts,Capacity';
const PLAN_HEAD = ['SiteName', 'YYYY-MM-DD', 'AreaName', 'MachineName', 'ShiftName',
  'ShiftStartTime', 'PartName', 'Good Parts', 'Defect Parts', 'Target', 'Capacity',
  'OEE', 'Total Time', 'Planned OpT', 'OEE Time', 'Downtime Units'].join(',');
const planRow = (site, date, area, machine, shift, part, good, cap) =>
  [site, date, area, machine, shift, `${date} 06:00:00`, part, good, '0', '0.00', cap, '50%',
    '08:00:00', '08:00:00', '04:00:00', '0.00'].join(',');
const csvLine = (cells) => cells.map((v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',');

const makeLake = () => new Map([
  [`${REF}/report_scope/site=All/report_scope.csv`, SCOPE_CSV],
  [`${REF}/machine_names/site=Hull/Hull_MachineNames.csv`,
    'MachineName,Dept,Area,Product Type\nB2 Auto,Liquids Pack,Liquids,Bottles\nSenokot Press,Dries Process,Dries,Bulk\n4 Tonne,Liquids Process,Liquids,Bulk\n'],
  [`${REF}/machine_names/site=Nottingham/Notts_MachineNames.csv`,
    'MachineName,Dept,Area,Product Type\nS06,Strepsils,Strepsils Packing,Blisters\n'],
  [`${REF}/machine_names/site=Weinheim/Wein_MachineNames.csv`,
    'MachineName,Dept,Area,Product Type\nLine 4,Packing,Line,Boxes\n'],
  [`${REF}/shift_naming/site=All/Shift Patterns.csv`,
    'ShiftName,Shift\nFriDay,Day\nMonDay,Day\nFriNight,Night\n'],
  [`${SRC}/run_rates/site=Hull/run_rates_2026-09.csv`, [
    RR_HEAD,
    'Hull,Hull Liquids,B2 Auto,2026-09-01 06:00:00,NFC 12 X 100ML,FriDay,1500,2400',
    'Hull,Hull Liquids,B2 Auto,2026-09-01 07:00:00,NFC 12 X 100ML,FriDay,0,2400',
    'Hull,Hull Liquids,B2 Auto,2026-09-01 08:00:00,NFC 12 X 100ML,Mystery,10,2400',
    'Hull,Hull Dries,Senokot Press,2026-09-01 06:00:00,Senna,FriDay,50,100',
    'Hull,Hull Dries,,2026-09-01 06:00:00,X,FriDay,50,100',
    ''
  ].join('\n')],
  [`${SRC}/run_rates/site=Weinheim/run_rates_2026-09.csv`, [
    RR_HEAD,
    csvLine(['Weinheim', 'Fixatives', 'Line 4', '2026-09-08 06:00:00', '3060509 Kukident,DE,12x40g', 'FriDay', '4320', '6000']),
    ''
  ].join('\n')],
  [`${SRC}/plan_opt/site=Hull/plan_opt_2026-09.csv`, [
    PLAN_HEAD,
    planRow('Hull', '2026-09-01', 'Hull Liquids', 'B2 Auto', 'FriDay', 'A', 800, '1000'),
    planRow('Hull', '2026-09-01', 'Hull Liquids', 'B2 Auto', 'MonDay', 'B', 700, '1500'),
    planRow('Hull', '2026-09-02', 'Hull Liquids', 'B2 Auto', 'FriDay', 'A', 900, '1000'),
    planRow('Hull', '2026-09-01', 'Hull Liquids', '4 Tonne', 'FriDay', 'Bulk', 5000, '6000'),
    planRow('Hull', '2026-09-01', 'Hull Dries', 'GT4 - Auto', 'FriDay', 'X', 5000, '6000'),
    ''
  ].join('\n')],
  [`${SRC}/plan_opt/site=Nottingham/plan_opt_2026-09.csv`, [
    PLAN_HEAD,
    planRow('Nottingham', '2026-09-01', ' Strepsils Packing', 'S06', 'FriDay', 'A', 800, '1000'),
    planRow('Nottingham', '2026-09-01', ' Strepsils Packing', 'S06', 'MonDay', 'B', 1200, '1500'),
    planRow('Nottingham', '2026-09-01', 'SD Packing', 'N11 Auto', 'FriDay', 'B', 5000, '1500'),
    ''
  ].join('\n')],
  [`${REF}/format_list/site=Hull/Format List 2025 Hull.csv`, [
    '\uFEFFSite Name,MachineName,Product Name,Brand,Unit Size,Unit Count/Format,Extra Info',
    'Hull,B2 Auto,NFC 12 X 100ML,Nurofen,100ml,12,',
    'Hull,B2 Auto,"Gav 6, glue",Gaviscon,200ml,6,Glue Cartons',
    ''
  ].join('\n')]
]);

const run = (job, extra = {}) => runFlow(flow, {
  startDay: '2026-10-15', startPayload: job, write: true, configNodes: config,
  platform: testPlatform(), lake: makeLake(), clientId: 'x', clientSecret: 'y',
  fetchImpl: async () => { throw new Error('no API call expected'); },
  ...extra
});
const rowsOf = (stats, name) => (stats.parquetPayloads[name] || []).flat();
const logText = (stats) => stats.logs.map(String).join('\n');
const tableWrites = (stats) => stats.written.filter((p) => p.startsWith(OUT));
const job = (tables, sites) => ({ tables, sites, from: '2026-09', to: '2026-09' });

let stats = await run({ tables: ['Plan_OPT_EU'] });
check(tableWrites(stats).length === 0 && stats.errors.some((e) => /unknown/.test(e)),
  'a table of the first tab is refused here');

// ---- Run_Rates_EU
stats = await run(job(['Run_Rates_EU'], ['Hull']));
check(stats.errors.length === 0, 'run rates: no error: ' + stats.errors.join(' | '));
check(JSON.stringify(tableWrites(stats)) ===
  JSON.stringify([`${OUT}/Run_Rates_EU/site=Hull/Run_Rates_EU_2026-09_provideam.parquet`]),
'run rates: one file per site and month: ' + tableWrites(stats).join(', '));
let rr = rowsOf(stats, RR);
check(rr.length === 3, 'run rates: rows without a machine and with Good Parts 0 are left out: ' + rr.length);
const b2 = rr.find((r) => r.MachineName === 'B2 Auto' && r['Good Parts'] === 1500);
check(b2.Date === Date.UTC(2026, 8, 1, 6) && b2.ShiftName === 'Day' && b2.Capacity === 2400,
  'run rates: Date is the hour (wall clock as UTC), shift mapped, capacity');
check(b2['Unique Machine Name'] === 'B2 Auto-Hull' && b2['Product Key'] === 'B2 Auto-Hull NFC 12 X 100ML' &&
  b2['Good Parts - Copy'] === 1500, 'run rates: unique machine name, product key, Good Parts - Copy');
check(b2.Dept === 'Liquids Pack' && b2['Data Source'] === 'Provideam' && b2['In EU Report'] === true,
  'run rates: machine columns and In EU Report');
check(rr.find((r) => r.MachineName === 'Senokot Press')['In EU Report'] === false,
  'run rates scope: Senokot Press is In EU Report false (Run_Rates_EU rule)');
check(rr.find((r) => r['Good Parts'] === 10).ShiftName === null && /shift not mapped: Mystery/.test(logText(stats)),
  'run rates: an unknown shift is empty and logged');
stats = await run(job(['Run_Rates_EU'], ['Weinheim']));
rr = rowsOf(stats, RR);
check(rr.length === 1 && rr[0].PartName === 'Kukident,DE,12x40g', 'run rates Weinheim: the part code (8 characters) is cut');
stats = await run(job(['Run_Rates_EU'], ['Nottingham']));
check(/no run_rates file for 2026-09, skipped/.test(logText(stats)) && tableWrites(stats).length === 0,
  'run rates: a month without a file is logged and skipped');

// ---- Volume_CoV_EU
stats = await run(job(['Volume_CoV_EU'], ['Hull']));
check(stats.errors.length === 0, 'volume CoV: no error: ' + stats.errors.join(' | '));
let cov = rowsOf(stats, COV);
const day1 = cov.filter((r) => r.MachineName === 'B2 Auto' && r.Date === 20697);
check(day1.length === 1 && day1[0]['Good Parts Sum'] === 1500 && day1[0]['Cap Max'] === 1500 && day1[0].Shift === 'Day',
  'volume CoV Hull: FriDay and MonDay are one group on the mapped shift Day, sum 1500, Cap Max 1500');
check(!cov.some((r) => r.Date === 20698), 'volume CoV: a group with 900 good parts (not over 1,000) is left out');
check(!cov.some((r) => r.MachineName === 'GT4 - Auto'), 'volume CoV Hull: GT4 - Auto is left out');
check(day1[0]['Shift Machine Key'] === 'Day B2 Auto' && day1[0]['Unique Machine Name'] === 'B2 Auto-Hull' &&
  day1[0].SiteName === 'Hull', 'volume CoV: Shift Machine Key, Unique Machine Name, SiteName');
check(cov.find((r) => r.MachineName === '4 Tonne')['In EU Report'] === false && day1[0]['In EU Report'] === true,
  'volume CoV scope: 4 Tonne In EU Report false');
stats = await run(job(['Volume_CoV_EU'], ['Nottingham']));
cov = rowsOf(stats, COV);
check(cov.length === 1 && cov[0]['Good Parts Sum'] === 1200 && cov[0].Shift === 'Day',
  'volume CoV Nottingham: groups on the raw shift (800 and 1200 apart, only 1200 is over 1,000), N11 Auto left out: ' +
  JSON.stringify(cov.map((r) => [r.MachineName, r['Good Parts Sum']])));

// ---- Format_List_EU
stats = await run(job(['Format_List_EU'], ['Hull', 'Nottingham']));
check(JSON.stringify(tableWrites(stats)) === JSON.stringify([`${OUT}/Format_List_EU/site=Hull/Format_List_EU.parquet`]),
  'format list: one file per site, Nottingham has none: ' + tableWrites(stats).join(', '));
check(/FAILED, NOTHING WRITTEN: format_list Nottingham: no csv file/.test(logText(stats)),
  'format list: a site without a file is logged');
const fmt = rowsOf(stats, FMT);
check(fmt.length === 2 && fmt[0]['Site Name'] === 'Hull' && fmt[0]['Extra Info'] === '' &&
  fmt[0]['Product Key'] === 'B2 Auto-Hull NFC 12 X 100ML' && fmt[1]['Product Name'] === 'Gav 6, glue',
'format list: byte order mark, empty cell is an empty text, Product Key, quoted comma');

// ---- all three in one job, dry run, missing scope file
stats = await run(job(['Run_Rates_EU', 'Volume_CoV_EU', 'Format_List_EU'], ['Hull']));
check(tableWrites(stats).length === 3, 'three tables in one job: three files');
stats = await run(job(['Run_Rates_EU'], ['Hull']), { write: false });
check(tableWrites(stats).length === 0 && /DRY RUN: Run_Rates_EU 3 rows/.test(logText(stats)), 'dry run: nothing written');
{
  const lake = makeLake();
  lake.delete(`${REF}/report_scope/site=All/report_scope.csv`);
  stats = await run(job(['Run_Rates_EU'], ['Hull']), { lake });
  check(tableWrites(stats).length === 0 && /report_scope\/site=All/.test(logText(stats)),
    'no report scope file: nothing written, logged');
}

// ---- column names and types
const EXPECT = {
  [RR]: ['Date', 'AreaName', 'MachineName', 'PartName', 'ShiftName', 'Good Parts', 'Capacity', 'SiteName',
    'Unique Machine Name', 'Product Key', 'Good Parts - Copy', 'Dept', 'Area', 'Product Type', 'Data Source',
    'In EU Report', 'loaded_at'],
  [COV]: ['Date', 'Shift', 'MachineName', 'Good Parts Sum', 'Cap Max', 'Shift Machine Key', 'Unique Machine Name',
    'SiteName', 'Dept', 'Area', 'Product Type', 'Data Source', 'In EU Report', 'loaded_at'],
  [FMT]: ['Site Name', 'MachineName', 'Product Name', 'Brand', 'Unit Size', 'Unit Count/Format', 'Extra Info',
    'Unique Machine Name', 'Product Key', 'loaded_at']
};
stats = await run(job(['Run_Rates_EU', 'Volume_CoV_EU', 'Format_List_EU'], ['Hull']));
Object.entries(EXPECT).forEach(([name, cols]) => {
  const pq = flow.find((n) => n.type === 'parquet' && n.name === name);
  check(JSON.stringify(pq.columns.map((c) => c.column)) === JSON.stringify(cols), `${name}: column names and order`);
  const rows = rowsOf(stats, name);
  check(rows.length > 0 && rows.every((r) => JSON.stringify(Object.keys(r).sort()) === JSON.stringify([...cols].sort())),
    `${name}: every row has exactly the schema columns`);
});

// ---- real files (optional)
if (process.argv.includes('real')) {
  const root = new URL('../sharepoint/', import.meta.url);
  const lake = new Map();
  const load = (group, type, months) => {
    for (const site of readdirSync(new URL(`${group}/${type}/`, root))) {
      for (const f of readdirSync(new URL(`${group}/${type}/${site}/`, root))) {
        const month = (/_(\d{4}-\d{2})\.csv$/.exec(f) || [])[1];
        if (months && !months.includes(month)) {
          continue;
        }
        const key = `${group === 'reference' ? REF : SRC}/${type}/${site}/${f}`;
        lake.set(key, readFileSync(new URL(`${group}/${type}/${site}/${f}`, root), 'utf8'));
      }
    }
  };
  ['machine_names', 'shift_naming', 'format_list', 'report_scope'].forEach((t) => load('reference', t));
  load('source', 'run_rates', ['2026-08', '2026-09']);
  load('source', 'plan_opt', ['2026-08', '2026-09']);
  const real = await run({ tables: ['Run_Rates_EU', 'Volume_CoV_EU', 'Format_List_EU'], from: '2026-08', to: '2026-09' },
    { lake });
  console.log('real run: errors', real.errors.length, '| files', tableWrites(real).length);
  real.logs.forEach((l) => console.log('  ', String(l).slice(0, 300)));
  const dirArg = process.argv.find((a) => a.startsWith('dir='));
  if (dirArg) {
    const dir = dirArg.slice(4);
    writeFileSync(`${dir}/run_rates.json`, JSON.stringify(rowsOf(real, RR)));
    writeFileSync(`${dir}/cov.json`, JSON.stringify(rowsOf(real, COV)));
    writeFileSync(`${dir}/format.json`, JSON.stringify(rowsOf(real, FMT)));
  }
}

console.log(failures ? `${failures} check(s) FAILED` : 'all checks passed');
process.exit(failures ? 1 : 0);
