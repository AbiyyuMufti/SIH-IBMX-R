// Offline test of the SIH report daily tab (flows/vfc-pbi-daily-hull.json):
// the three Tableau tables of one production day straight from the API
// (mock), with the report columns, Data Source SIH and the folder split by
// line source. Also the hourly schedule check of 1.1 and the column rules
// of node "Build report columns" on a small synthetic day.
// Usage: node scripts/test-vfc-sih-report.js platform=legacy|xcelerator
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { runFlow, testPlatform } from './lib-vfc-runner.js';
import { makeMockFetch } from './lib-mock-ih.js';
import { code } from './lib-flow-builder.js';

const read = (f) => JSON.parse(readFileSync(new URL('../flows/' + f, import.meta.url), 'utf8'));
const config = read('vfc-config.json');
const daily = read('vfc-pbi-daily-hull.json');
const day = '2026-09-30';
const REF = 'eu_report/reference';
const LIVE = 'eu_report/report';
const CAND = 'eu_report/candidate/sih';
const makeLake = () => new Map([
  [`${REF}/glidepaths/site=Hull/Glidepath Hull.csv`, [
    '﻿Site Name,Line,OEE Bucket,01/09/2026',
    'Hull,B2 Auto,% OEE,55',
    'Hull,B2 Auto,Planned Downtime (Total),12.5',
    'Hull,B2 Auto,Unplanned Downtime (Total),20',
    'Hull,B2 Auto,Unplanned,3',
    ''
  ].join('\n')],
  [`${REF}/machine_names/site=Hull/Hull_MachineNames.csv`, [
    'MachineName,Dept,Area,Product Type',
    'B2 Auto,Liquids Pack,Liquids,Bottles',
    'GT4 - Auto,Dries Pack,Dries,Blisters',
    ''
  ].join('\n')],
  [`${REF}/shift_naming/site=All/Shift Patterns.csv`, [
    'ShiftName,Shift',
    'MonDay,Day',
    ''
  ].join('\n')]
]);
// Config with Mock Line A as the Hull line "B2 Auto" on source sih.
const lineConfig = JSON.parse(JSON.stringify(config));
const cfgNode = lineConfig.find((n) => n.type === 'function');
cfgNode.func = cfgNode.func.replace("id: 'cf4565d7da1e4efcbc0ea6a4814b8eee'",
  "id: '" + 'a'.repeat(32) + "', reportSource: 'sih'");
const base = (extra) => ({
  startDay: day, write: true, configNodes: config, lake: makeLake(),
  platform: testPlatform(), fetchImpl: makeMockFetch('ok'), clientId: 'x',
  clientSecret: 'y', allAssets: true, ...extra
});

let failures = 0;
const check = (ok, text) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + text);
  if (!ok) failures++;
};
const W = (t) => `Write ${t} parquet`;
const rowsOf = (stats, t) => (stats.parquetPayloads[W(t)] || []).flat();
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;
const sum = (rows, key) => rows.reduce((t, r) => t + (r[key] || 0), 0);
const logText = (s) => s.logs.map(String).join('\n');

// ---- 1. a plain day: three tables, report columns, candidate folder ----
const plain = await runFlow(daily, base());
plain.errors.forEach((e) => console.log('ERROR:', e));
check(plain.errors.length === 0, 'plain day: no error');
const paths = plain.written.filter((p) => !p.includes('/logs/'));
console.log('paths:', paths.join(', '));
for (const t of ['Plan_OPT_EU', 'Time_Utilisation_EU', 'Daily_Losses_EU']) {
  check(paths.includes(`${CAND}/${t}/site=Hull/${t}_${day}_sih.parquet`),
    `${t}: daily file in candidate/sih (lines not in CONFIG follow the site, provideam)`);
  check(rowsOf(plain, t).every((r) => r['Data Source'] === 'SIH' && r.SiteName === 'Hull'),
    `${t}: Data Source SIH, SiteName Hull`);
}
check(plain.written.includes('eu_report/logs/sih-hull/log_2026-10.csv'), 'log file logs/sih-hull');
check(/not a CONFIG line \(SIH name kept\): Mock Line A/.test(logText(plain)),
  'log names the assets that are not CONFIG lines');
const plainPlan = rowsOf(plain, 'Plan_OPT_EU');
check(plainPlan.every((r) => r.PartName === null && r.Capacity === null),
  'no products: PartName and Capacity empty');

// ---- 2. dry run and failures ----
const dry = await runFlow(daily, base({ write: false }));
check(Object.keys(dry.parquetRows).length === 0, 'dry run: no table written');
check(/DRY RUN: Plan_OPT_EU \d+ rows to eu_report\/candidate\/sih/.test(logText(dry)),
  'dry run: log line with rows and folder per table');
for (const scenario of ['kpi-413', 'stops-fail', 'details-fail', 'stops-paged',
  'kpi-fail', 'values-fail', 'products-fail', 'value-kpi-fail']) {
  const s = await runFlow(daily, base({ fetchImpl: makeMockFetch(scenario) }));
  check(Object.keys(s.parquetRows).length === 0 && /FAILED, NOTHING WRITTEN/.test(logText(s)),
    `${scenario}: nothing written, FAILED in log`);
}
for (const scenario of ['token-fail', 'list-fail', 'empty']) {
  const s = await runFlow(daily, base({ fetchImpl: makeMockFetch(scenario) }));
  check(Object.keys(s.parquetRows).length === 0, `${scenario}: nothing written`);
}
const noGlide = makeLake();
noGlide.delete(`${REF}/glidepaths/site=Hull/Glidepath Hull.csv`);
const ng = await runFlow(daily, base({ lake: noGlide }));
check(Object.keys(ng.parquetRows).length === 0 && ng.requests.length === 0 &&
  /FAILED, NOTHING WRITTEN: glidepaths Hull/.test(logText(ng)),
  'no Glidepaths file: no API call, nothing written, log names it');

// ---- 3. products and orders (the API part, same rules as before) ----
const prod = await runFlow(daily, base({ fetchImpl: makeMockFetch('products') }));
check(prod.errors.length === 0, 'products: no error');
const plan = rowsOf(prod, 'Plan_OPT_EU');
const loss = rowsOf(prod, 'Daily_Losses_EU');
const util = rowsOf(prod, 'Time_Utilisation_EU');
const planA = plan.filter((r) => r.MachineName === 'Mock Line A');
const planB = plan.filter((r) => r.MachineName === 'Mock Line B');
const byPart = (rows, part) => rows.find((r) => r.PartName === part);
check(planA.length === 2, 'A: two plan rows (one per product)');
const p1 = byPart(planA, 'mock text');
const p2 = byPart(planA, '1002');
check(!!p1 && !!p2, 'A: part name is the description, else the name');
check(p1 && p1['Product Key'] === 'Mock Line A-Hull mock text',
  'Product Key = Unique Machine Name + space + PartName');
check(p1 && p2 && p1.source_hours === 12 && p2.source_hours === 12,
  'A: idle hours follow the hour before, 12 hours each');
check(p1 && near(p1.Capacity, 210 * 360) && p2 && near(p2.Capacity, 200 * 360),
  'A: capacity = design speed per minute x planned OpT');
check(p1 && near(p1['Downtime Units'], 210 * 1.1) && near(p2['Downtime Units'], 200 * 3.5),
  'A: downtime units = design speed per minute x downtime minutes');
check(p1 && Number.isInteger(p1['Planned OpT']) && Number.isInteger(p1['Good Parts']),
  'plan: Planned OpT and Good Parts are whole numbers (INT64)');
check(planB.length === 3, 'B: three plan rows (Slow, Unknown, Odd)');
const slow = byPart(planB, 'Slow');
check(slow && near(slow.Capacity, (5.4165 / 60) * 180), 'B Slow: speed per hour converted');
check(byPart(planB, 'Unknown').Capacity === null && byPart(planB, 'Odd').Capacity === null,
  'B Unknown and Odd: no capacity');
for (const m of ['Mock Line A', 'Mock Line B']) {
  const a = plainPlan.filter((r) => r.MachineName === m);
  const b = plan.filter((r) => r.MachineName === m);
  // Good Parts is a whole number per row (INT64): each row rounds by <= 0.5.
  check(near(sum(a, 'source_hours'), sum(b, 'source_hours')) &&
    Math.abs(sum(a, 'Good Parts') - sum(b, 'Good Parts')) <= 0.5 * (a.length + b.length),
    `${m}: totals equal with and without products (good parts within rounding)`);
  const u = util.find((r) => r.MachineName === m);
  check(u && near(u['Planned OPT Total'] || 0, 720), `${m}: time utilisation planned OpT total 720`);
}
const lossA = loss.filter((r) => r.MachineName === 'Mock Line A');
check(lossA.length > 0 && lossA.every((r) => r.batch_id === 'O-1' && r.PartName === 'mock text'),
  'A stops: part and order of the hour of the stop');
const jam = lossA.find((r) => r.OEELossLvl3Desc === 'Jam');
check(jam && near(jam['Loss Units'], 25 * 210) && jam.Duration === 25 * 60000 && jam['Time in Mins'] === 25,
  'A stop Jam: loss units, Duration (ms) and Time in Mins');
check(jam && jam['Volume Total'] === sum(planA, 'Capacity'),
  'Volume Total = capacity of the machine and day');
const open = lossA.find((r) => r.OEELossLvl3Desc === 'Open stop');
check(open && open['Loss Units'] === null && open.Duration === null, 'A open stop: no duration, no loss units');
const filtered = prod.requests.filter((q) => q.url.endsWith('/evaluateKPIs') &&
  /"(PRODUCT|ORDER)","value":\["/.test(q.body));
check(filtered.length === 7, `7 filtered KPI calls, got ${filtered.length}`);
const nocol = await runFlow(daily, base({ fetchImpl: makeMockFetch('no-collection') }));
const ncA = rowsOf(nocol, 'Plan_OPT_EU').filter((r) => r.MachineName === 'Mock Line A');
check(ncA.length === 2 && ncA.every((r) => r.Capacity === null && /^100[12]$/.test(r.PartName)),
  'no-collection: name used as part name, no capacity');

// ---- 4. CONFIG line on source sih: report name, lookups, report folder ----
const lined = await runFlow(daily, base({ configNodes: lineConfig, fetchImpl: makeMockFetch('products') }));
lined.errors.forEach((e) => console.log('ERROR lined:', e));
const lPlan = rowsOf(lined, 'Plan_OPT_EU');
const b2 = lPlan.filter((r) => r.MachineName === 'B2 Auto');
check(b2.length === 2 && b2.every((r) => r['Unique Machine Name'] === 'B2 Auto-Hull'),
  'line: MachineName is the report name, Unique Machine Name B2 Auto-Hull');
check(b2.every((r) => r['OEE Target'] === 55 && r['PDT Target'] === 12.5 && r['UPDT Target'] === 20),
  'line: OEE, PDT, UPDT targets from Glidepaths');
check(b2.every((r) => r.Dept === 'Liquids Pack' && r.Area === 'Liquids' && r['Product Type'] === 'Bottles'),
  'line: Dept, Area, Product Type from Machine Names');
const lPaths = lined.written.filter((p) => !p.includes('/logs/'));
check(lPaths.includes(`${LIVE}/Plan_OPT_EU/site=Hull/Plan_OPT_EU_${day}_sih.parquet`) &&
  lPaths.includes(`${CAND}/Plan_OPT_EU/site=Hull/Plan_OPT_EU_${day}_sih.parquet`),
  'line on sih goes to report/, the other asset to candidate/sih/ (two files)');
const pq = lined.parquetPayloads[W('Plan_OPT_EU')];
check(pq.length === 2 && pq.some((rows) => rows.every((r) => r.MachineName === 'B2 Auto')),
  'one parquet message per folder, each with its own machines');
const b2Loss = rowsOf(lined, 'Daily_Losses_EU').filter((r) => r.MachineName === 'B2 Auto');
const unplanned = b2Loss.find((r) => r.OEELossLvl3SubGroup === 'Unplanned');
check(unplanned && unplanned.Value === '3.0' && near(unplanned.target, 0.03),
  'loss Value and target from the Glidepaths bucket of the sub group');
check(b2Loss.every((r) => r['Loss Target Key'] === 'B2 Auto-Hull ' + r.OEELossLvl3SubGroup + ' 01/09/2026'),
  'Loss Target Key = Unique Machine Name + sub group + month');

// ---- 5. column rules on a small synthetic day (node Build report columns) ----
const ctx = {
  cfg: {
    site: 'Hull', source: 'sih', siteSource: 'provideam',
    liveFolder: LIVE, candidateFolder: CAND,
    lines: [{ id: 'L1', report: 'B2 Auto', reportSource: 'sih' }]
  },
  targets_Hull: {},
  machines_Hull: { 'B2 Auto': { Dept: 'D', Area: 'A', 'Product Type': 'P' } },
  shiftMap: { MonDay: 'Day' }
};
const flowCtx = { get: (k) => ctx[k], set: () => {} };
const lossRow = (shift, sub, equipment) => ({
  machine_name: 'B2 Line', unique_machine_name: 'L1', date: '2026-09-02',
  time: '05:30:15', shift_start_date: '2026-09-01', shift_name: shift,
  duration: 1.5, loss_units: null, loss_lvl3_group: 'Not Logged',
  loss_lvl3_sub_group: sub, loss_lvl3_desc: 'Unplanned Downtime',
  equipment, breakdown_types: null, batch_id: null, comment_count: 0,
  part_name: null, loaded_at: 1
});
const rulesMsg = {
  day: '2026-09-01', summary: { notes: [] },
  planRows: [
    { unique_machine_name: 'L1', machine_name: 'B2 Line', date: '2026-09-01', shift_name: 'Red', part_name: 'P1', good_parts: 10.4, capacity: 100, total_time: 59.9, planned_opt: 30.2, oee_time: null, downtime_units: null, source_hours: 1, loaded_at: 1 },
    { unique_machine_name: 'L1', machine_name: 'B2 Line', date: '2026-09-01', shift_name: 'MonDay', part_name: 'P1', good_parts: 1, capacity: 50, total_time: 1, planned_opt: 1, oee_time: 1, downtime_units: 1, source_hours: 1, loaded_at: 1 },
    { unique_machine_name: 'X9', machine_name: 'Other', date: '2026-09-01', shift_name: 'Yellow', part_name: null, good_parts: 1, capacity: null, total_time: 1, planned_opt: 1, oee_time: 1, downtime_units: 1, source_hours: 1, loaded_at: 1 }
  ],
  utilRows: [],
  lossRows: [lossRow('Red', null, null), lossRow('Second Shift', 'Breakdown', 'Capper')]
};
const reportNode = vm.runInNewContext('(function(msg,flow,node){' + code('d8-report-rows.js') + '\n})', {});
const out = reportNode(rulesMsg, flowCtx, { status: () => {}, error: () => {} });
const live = out.tables.Plan_OPT_EU.find((g) => g.out === LIVE).rows;
const cand = out.tables.Plan_OPT_EU.find((g) => g.out === CAND).rows;
check(live.length === 2 && cand.length === 1, 'rows split by folder: line on sih to report, unknown asset to candidate');
check(live[0].ShiftName === 'Red' && live[1].ShiftName === 'Day' && cand[0].ShiftName === 'Yellow',
  'shift: report name kept, Shift Patterns name mapped, unknown name kept');
check(live[0]['Good Parts'] === 10 && live[0]['Total Time'] === 59 && live[0]['Planned OpT'] === 30 && live[0]['OEE Time'] === null,
  'plan minutes cut to whole minutes, good parts rounded, empty stays empty');
check(cand[0].MachineName === 'Other' && cand[0].Dept === null && cand[0]['Product Key'] === 'Other-Hull ',
  'asset without a CONFIG line: SIH name, no Dept, Product Key with empty part');
const lr = out.tables.Daily_Losses_EU[0].rows;
check(lr[0].OEELossLvl3SubGroup === 'Not Logged' && lr[0].Equipment === 'Unclassed' &&
  lr[1].OEELossLvl3SubGroup === 'Breakdown' && lr[1].Equipment === 'Capper',
  'loss: empty sub group Not Logged, empty equipment Unclassed, else as SIH gives them');
check(lr[0].Date === Date.UTC(2026, 8, 2) / 864e5 && lr[0].ShiftStartDate === Date.UTC(2026, 8, 1) / 864e5,
  'loss: Date = local date of the stop, ShiftStartDate = production day');
check(lr[0].Time === (5 * 3600 + 30 * 60 + 15) * 1000 && lr[0].Duration === 90000,
  'loss: Time = ms of the day, Duration = ms');
check(lr[0]['Volume Key'] === '01/09/2026 B2 Auto Not Logged Not Logged Unplanned Downtime' &&
  lr[0]['Volume Total'] === 150,
  'loss: Volume Key the report way, Volume Total = capacity of the day');
check(out.summary.notes.some((n) => /Yellow/.test(n) && /Second Shift/.test(n)) &&
  out.summary.notes.some((n) => /not a CONFIG line.*Other/.test(n)),
  'notes name the unmapped shifts and the assets without a line');

// ---- 6. the hourly schedule check of 1.1 ----
const settings = daily.find((n) => n.type === 'function' && /SITE SETTINGS/.test(n.name)).func;
const runSettings = (payload, hourSetting) => {
  const shared = {
    root: 'eu_report',
    sites: [{ name: 'Hull', assetIds: ['a'], lines: [], reportSource: 'provideam', dayStartHour: 6, sihRunHourUtc: hourSetting }]
  };
  const g = { get: () => shared };
  const f = { set: () => {} };
  const fn = vm.runInNewContext('(function(msg,flow,node,glob){' + settings + '\n})', {});
  return fn({ payload }, f, { status: () => {}, error: () => {} }, g);
};
const nowHour = new Date().getUTCHours();
check(runSettings(Date.now(), nowHour) !== null, 'tick in the hour sihRunHourUtc: the run starts');
check(runSettings(Date.now(), (nowHour + 1) % 24) === null, 'tick in another hour: nothing runs');
check(runSettings(Date.now(), undefined) === null, 'no sihRunHourUtc: the tick never runs');
check(runSettings({ start: day, end: day }, undefined) !== null, 'backfill runs without sihRunHourUtc');
const badCfg = config.find((n) => n.type === 'function').func.replace('sihRunHourUtc: 7', 'sihRunHourUtc: 24');
const cfgStore = {};
const errs = [];
vm.runInNewContext('(function(msg,flow,node,glob){' + badCfg.replace(/platform: '[^']*'/, "platform: 'legacy'") + '\n})', {})(
  {}, {}, { status: () => {}, error: (e) => errs.push(e) }, { get: (k) => cfgStore[k], set: (k, v) => { cfgStore[k] = v; } });
check(!cfgStore.cfg && errs.some((e) => /sihRunHourUtc/.test(e)), 'CONFIG refuses sihRunHourUtc 24');

// ---- 7. shift rule and sums on a small synthetic day (node 4.4) ----
const H = 3600000;
const t0 = Date.parse('2026-09-06T06:00:00Z');
const hour = (i, extra) => ({
  time: new Date(Date.parse('2026-09-16T06:00:00Z') + i * H).toISOString(),
  values: {
    good_parts: 100, total_time_ms: H, planned_stop_shift_plan_ms: 0,
    operational_time_ms: H, used_operational_time_ms: null, ...extra
  }
});
const planMsg = {
  day: '2026-09-16',
  asset: { id: 'A' },
  h: { site: 'Hull', area: 'Bottles', asset_name: 'B2 Line' },
  shiftRules: [{ name: 'Red', freq: 'DAILY', interval: 10, start: t0, until: null, duration: 12 * H }],
  hours: [
    hour(0),
    hour(1, { used_operational_time_ms: 30 * 60000 }),
    hour(13),
    hour(2, { planned_stop_shift_plan_ms: H / 2 })
  ]
};
const planOut = vm.runInNewContext('(function(msg,flow,node){' + code('d4-plan-rows.js') + '\n})', {})(
  planMsg, { get: () => ({}) }, { status: () => {}, error: () => {} });
const red = planOut.planRows.find((r) => r.shift_name === 'Red');
const none = planOut.planRows.find((r) => r.shift_name === null);
check(red && red.source_hours === 3, 'hours 06, 07, 08 on 16 Sep are in the Red shift (3 rows)');
check(none && none.source_hours === 1, 'hour 19:00 is outside every shift: shift_name null');
check(red && red.total_time === 150 && red.oee_time === 30, 'total time and oee time summed in minutes');
check(planOut.utilRows.length === 1 && planOut.utilRows[0].total_time_total === 210, 'time utilisation row: total of all shifts');

console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exitCode = failures ? 1 : 0;
