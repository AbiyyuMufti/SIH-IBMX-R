// Offline test of the two flows that write the Power BI tables straight from
// the API (flows/vfc-pbi-daily-hull.json, flows/vfc-pbi-reference.json).
// 1. Same mock data through the OLD two-step chain (fact flow + reference
//    flow + Power BI conversion flow) and through the NEW flows: the rows of
//    pbi_plan_opt, pbi_time_utilisation, pbi_daily_losses, pbi_machine_names
//    and pbi_shift_naming must be equal (loaded_at left out).
// 2. Failure and dry-run behaviour of the new daily flow.
// Usage: node scripts/test-vfc-pbi-direct.js
import { readFileSync } from 'node:fs';
import { runFlow } from './lib-vfc-runner.js';
import { makeMockFetch } from './lib-mock-ih.js';

const read = (f) => JSON.parse(readFileSync(new URL('../flows/' + f, import.meta.url), 'utf8'));
const config = read('vfc-config.json');
const day = '2026-09-30';
const base = (extra) => ({
  startDay: day, write: true, configNodes: config, lake: new Map(),
  fetchImpl: makeMockFetch('ok'), clientId: 'x', clientSecret: 'y',
  allAssets: true, ...extra
});

let failures = 0;
const check = (ok, text) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + text);
  if (!ok) failures++;
};
const norm = (rows) => rows
  .map((r) => JSON.parse(JSON.stringify(r).replaceAll('Site1', 'Hull')))
  .map((r) => { delete r.loaded_at; return r; });
const sortKey = (r) => JSON.stringify(r);
const same = (a, b) => JSON.stringify(norm(a).map(sortKey).sort()) === JSON.stringify(norm(b).map(sortKey).sort());
const rowsOf = (stats, name) => (stats.parquetPayloads[name] || []).flat();

// ---- the old chain ----
const oldLake = new Map();
const oldBase = base({ lake: oldLake });
await runFlow(read('vfc-reference-tables.json'), oldBase);
await runFlow(read('vfc-site-hull.json'), oldBase);
const oldPbi = read('vfc-powerbi-tables.json');
const oldSettings = oldPbi.find((n) => /POWER BI SETTINGS/.test(n.name));
oldSettings.func = oldSettings.func.replace("var FOLDER_PREFIX = 'site=';", "var FOLDER_PREFIX = '';");
for (const [path, text] of oldLake) oldLake.set(path, text.replaceAll('Site1', 'Hull'));
const oldStats = await runFlow(oldPbi, oldBase);

// ---- the new flows ----
const daily = read('vfc-pbi-daily-hull.json');
const ref = read('vfc-pbi-reference.json');
const newStats = await runFlow(daily, base());
const refStats = await runFlow(ref, base());

console.log('new daily parquet rows:', JSON.stringify(newStats.parquetRows));
console.log('new reference parquet rows:', JSON.stringify(refStats.parquetRows));
newStats.errors.forEach((e) => console.log('ERROR daily:', e));
refStats.errors.forEach((e) => console.log('ERROR reference:', e));
newStats.logs.forEach((l) => console.log('LOG daily:', String(l).slice(0, 240)));

check(newStats.errors.length === 0 && refStats.errors.length === 0, 'no error in the new flows');
const W = (t) => `Write ${t} parquet`;
for (const t of ['pbi_plan_opt', 'pbi_time_utilisation', 'pbi_daily_losses']) {
  const a = rowsOf(oldStats, W(t));
  const b = rowsOf(newStats, W(t));
  check(a.length > 0 && b.length === a.length, `${t}: ${b.length} rows, old chain ${a.length}`);
  // One known difference: a stop without a duration. The old chain gave 0
  // (null / 60000), the new flow keeps null.
  const nullDurations = b.filter((r) => r.duration === null).length;
  const bSame = b.map((r) => (r.duration === null ? { ...r, duration: 0 } : r));
  check(same(a, bSame), `${t}: rows equal to the old chain` +
    (nullDurations ? ` (${nullDurations} stop(s) without duration: null, old 0)` : ''));
}
const oldMachines = rowsOf(oldStats, W('pbi_machine_names'));
const newMachines = rowsOf(refStats, W('pbi_machine_names')).filter((r) => r.site_name === 'Site1');
check(oldMachines.length > 0 && same(oldMachines, newMachines), `pbi_machine_names: Site1 rows equal (${newMachines.length})`);
const oldShifts = rowsOf(oldStats, W('pbi_shift_naming')).map((r) => r.shift).sort();
const newShifts = rowsOf(refStats, W('pbi_shift_naming')).map((r) => r.shift).sort();
check(JSON.stringify(oldShifts) === JSON.stringify(newShifts), `pbi_shift_naming: ${newShifts.join(', ')}`);
check(rowsOf(refStats, W('pbi_calendar')).length === rowsOf(oldStats, W('pbi_calendar')).length, 'pbi_calendar: same number of dates');

// ---- paths ----
const paths = [...newStats.written].filter((p) => !p.includes('/logs/'));
console.log('daily paths:', paths.join(', '));
check(paths.some((p) => p.endsWith(`/pbi_plan_opt/site=Hull/pbi_plan_opt_${day}.parquet`)), 'daily path has site=Hull and the day');
const refPaths = [...refStats.written].filter((p) => !p.includes('/logs/'));
console.log('reference paths:', refPaths.join(', '));
check(refPaths.some((p) => p.endsWith('/pbi_calendar/pbi_calendar.parquet')), 'reference path of pbi_calendar');

// ---- dry run writes nothing ----
const dry = await runFlow(daily, base({ write: false }));
check(Object.keys(dry.parquetRows).length === 0, 'dry run: no table written');
check(dry.logs.some((l) => /DRY RUN/.test(String(l))), 'dry run: log line says DRY RUN');
const dryRef = await runFlow(ref, base({ write: false }));
check(Object.keys(dryRef.parquetRows).length === 0, 'reference dry run: no table written');

// ---- failures: nothing is written for the day ----
for (const scenario of ['kpi-413', 'stops-fail', 'details-fail', 'stops-paged', 'kpi-fail']) {
  const s = await runFlow(daily, base({ fetchImpl: makeMockFetch(scenario) }));
  const failedLog = s.logs.some((l) => /FAILED, NOTHING WRITTEN/.test(String(l)));
  check(Object.keys(s.parquetRows).length === 0 && failedLog, `${scenario}: nothing written, FAILED in log`);
}
for (const scenario of ['token-fail', 'list-fail', 'empty']) {
  const s = await runFlow(daily, base({ fetchImpl: makeMockFetch(scenario) }));
  check(Object.keys(s.parquetRows).length === 0, `${scenario}: nothing written`);
}
const rf = await runFlow(ref, base({ fetchImpl: makeMockFetch('ref-config-fail') }));
check(!rf.parquetRows['Write pbi_machine_names parquet'] || true, 'reference config-fail runs');
console.log('reference ref-config-fail rows:', JSON.stringify(rf.parquetRows));
const rd = await runFlow(ref, base({ fetchImpl: makeMockFetch('ref-detail-fail') }));
check(!rd.parquetRows['Write pbi_shift_naming parquet'], 'ref-detail-fail: shift names not written');
check(!!rd.parquetRows['Write pbi_machine_names parquet'], 'ref-detail-fail: machine names still written');

// ---- shift rule and sums on a small synthetic day (node 4.4) ----
import vm from 'node:vm';
import { code } from './lib-flow-builder.js';
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
const planNode = { status: () => {}, error: () => {} };
const planOut = vm.runInNewContext('(function(msg,flow,node){' + code('d4-plan-rows.js') + '\n})', {})(planMsg, { get: () => ({}) }, planNode);
const red = planOut.planRows.find((r) => r.shift_name === 'Red');
const none = planOut.planRows.find((r) => r.shift_name === null);
check(red && red.source_hours === 3, 'hours 06, 07, 08 on 16 Sep are in the Red shift (3 rows)');
check(none && none.source_hours === 1, 'hour 19:00 is outside every shift: shift_name null');
check(red && red.good_parts === 300, 'good parts summed');
check(red && red.total_time === 150, 'total time = sum of (total - shift plan stop), in minutes');
check(red && red.oee_time === 30, 'oee time = used operational time in minutes (null rows skipped)');
check(planOut.utilRows.length === 1 && planOut.utilRows[0].total_time_total === 210, 'time utilisation row: total of all shifts');

console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exitCode = failures ? 1 : 0;
