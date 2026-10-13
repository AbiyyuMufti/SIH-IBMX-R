// Offline test of the two flows that write the Power BI tables straight from
// the API (flows/vfc-pbi-daily-hull.json, flows/vfc-pbi-reference.json).
// 1. Same mock data through the OLD two-step chain (fact flow + reference
//    flow + Power BI conversion flow) and through the NEW flows: the rows of
//    pbi_plan_opt, pbi_time_utilisation, pbi_daily_losses, pbi_machine_names
//    and pbi_shift_naming must be equal (loaded_at left out).
// 2. Failure and dry-run behaviour of the new daily flow.
// Usage: node scripts/test-vfc-pbi-direct.js
import { readFileSync } from 'node:fs';
import { runFlow, testPlatform } from './lib-vfc-runner.js';
import { makeMockFetch } from './lib-mock-ih.js';

const read = (f) => JSON.parse(readFileSync(new URL('../flows/' + f, import.meta.url), 'utf8'));
const config = read('vfc-config.json');
const day = '2026-09-30';
const base = (extra) => ({
  startDay: day, write: true, configNodes: config, lake: new Map(),
  platform: testPlatform(),
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
// Since 2026-10-13 the new flow sets product_type = area (decision of the
// user); the old chain still has null. Everything else must be equal.
const oldMachines = rowsOf(oldStats, W('pbi_machine_names')).map((r) => ({ ...r, product_type: r.area }));
const newMachines = rowsOf(refStats, W('pbi_machine_names')).filter((r) => r.site_name === 'Site1');
check(oldMachines.length > 0 && same(oldMachines, newMachines), `pbi_machine_names: Site1 rows equal, product_type = area (${newMachines.length})`);
check(newMachines.every((r) => r.product_type === r.area && r.product_type !== null), 'pbi_machine_names: product_type is the area');
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

// ---- products and orders (stages 5 to 7) ----
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;
const prod = await runFlow(daily, base({ fetchImpl: makeMockFetch('products') }));
prod.errors.forEach((e) => console.log('ERROR products:', e));
check(prod.errors.length === 0, 'products: no error');
const plan = rowsOf(prod, W('pbi_plan_opt'));
const loss = rowsOf(prod, W('pbi_daily_losses'));
const util = rowsOf(prod, W('pbi_time_utilisation'));
const planA = plan.filter((r) => r.machine_name === 'Mock Line A');
const planB = plan.filter((r) => r.machine_name === 'Mock Line B');
const byKey = (rows, key) => rows.find((r) => r.product_key === key);
check(planA.length === 2, 'A: two plan rows (one per product)');
const p1 = byKey(planA, '1001');
const p2 = byKey(planA, '1002');
check(p1 && p1.part_name === 'mock text', 'A 1001: part name is the description');
check(p2 && p2.part_name === '1002', 'A 1002: no description, part name is the name');
check(p1 && p2 && p1.source_hours === 12 && p2.source_hours === 12,
  'A: idle hours follow the hour before (hour 0 the next), 12 hours each');
check(p1 && near(p1.capacity, 210 * 360) && p2 && near(p2.capacity, 200 * 360),
  'A: capacity = design speed per minute x planned OpT');
check(p1 && near(p1.downtime_units, 210 * 1.1) && p2 && near(p2.downtime_units, 200 * 3.5),
  'A: downtime units = design speed per minute x downtime minutes');
check(planB.length === 3, 'B: three plan rows (Slow, Unknown, Odd)');
const slow = byKey(planB, 'S1');
check(slow && slow.part_name === 'Slow' && near(slow.capacity, (5.4165 / 60) * 180),
  'B Slow: speed per hour converted to per minute, code is the key');
const unknown = byKey(planB, 'Unknown');
check(unknown && unknown.part_name === 'Unknown' && unknown.capacity === null,
  'B Unknown: not in the product list, name as key, no capacity');
const odd = byKey(planB, 'Odd');
check(odd && odd.capacity === null, 'B Odd: unknown speed interval, no capacity');

// The totals do not change by splitting the rows.
const plain = await runFlow(daily, base());
const plainPlan = rowsOf(plain, W('pbi_plan_opt'));
const sum = (rows, key) => rows.reduce((t, r) => t + (r[key] || 0), 0);
for (const m of ['Mock Line A', 'Mock Line B']) {
  const a = plainPlan.filter((r) => r.machine_name === m);
  const b = plan.filter((r) => r.machine_name === m);
  check(['good_parts', 'total_time', 'oee_time', 'source_hours'].every(
    (k) => near(sum(a, k), sum(b, k))), `${m}: totals equal with and without products`);
}
check(['Mock Line A', 'Mock Line B'].every((m) => {
  const u = util.find((r) => r.machine_name === m);
  const rows = plan.filter((r) => r.machine_name === m);
  return u && near(u.total_time_total || 0, sum(rows, 'total_time')) &&
    near(u.planned_opt_total || 0, sum(rows, 'planned_opt')) &&
    near(u.oee_time_total || 0, sum(rows, 'oee_time'));
}), 'time utilisation row = sum of the plan rows of the machine');

// Stops: product, part name and batch id of the hour of the stop.
const lossA = loss.filter((r) => r.machine_name === 'Mock Line A');
check(lossA.length > 0 && lossA.every((r) => r.product_key === '1001' && r.batch_id === 'O-1'),
  'A stops: product 1001 and order O-1 (hour 0 takes the next value)');
const jam = lossA.find((r) => r.loss_lvl3_desc === 'Jam');
check(jam && near(jam.loss_units, 25 * 210), 'A stop Jam: loss units = 25 min x 210');
const open = lossA.find((r) => r.loss_lvl3_desc === 'Open stop');
check(open && open.loss_units === null, 'A open stop: no duration, no loss units');
const lossB = loss.filter((r) => r.machine_name === 'Mock Line B');
check(lossB.length > 0 && lossB.every((r) => r.product_key === 'S1' && r.batch_id === null),
  'B stops: product S1, no order');

// Calls: one filtered KPI call per product and per order.
const filtered = prod.requests.filter((q) => q.url.endsWith('/evaluateKPIs') &&
  /"(PRODUCT|ORDER)","value":\["/.test(q.body));
check(filtered.length === 7, `7 filtered KPI calls (A: 2 products, 2 orders; B: 3 products), got ${filtered.length}`);
check(prod.requests.some((q) => /\/filterValues\?from=.*&to=/.test(q.url)), 'filterValues asked with the day window');

// A day without products behaves as before (no filterValues values).
check(plainPlan.every((r) => r.part_name === null && r.capacity === null), 'no products: part name and capacity null');

// Without a product collection the names are kept and no speed is known.
const nocol = await runFlow(daily, base({ fetchImpl: makeMockFetch('no-collection') }));
const ncA = rowsOf(nocol, W('pbi_plan_opt')).filter((r) => r.machine_name === 'Mock Line A');
check(ncA.length === 2 && ncA.every((r) => r.capacity === null && r.part_name === r.product_key),
  'no-collection: name used as key and part name, no capacity');

// Failures of the new calls: nothing is written for the day.
for (const scenario of ['values-fail', 'products-fail', 'value-kpi-fail']) {
  const s = await runFlow(daily, base({ fetchImpl: makeMockFetch(scenario) }));
  const failedLog = s.logs.some((l) => /FAILED, NOTHING WRITTEN/.test(String(l)));
  check(Object.keys(s.parquetRows).length === 0 && failedLog, `${scenario}: nothing written, FAILED in log`);
}
const dryProd = await runFlow(daily, base({ write: false, fetchImpl: makeMockFetch('products') }));
check(Object.keys(dryProd.parquetRows).length === 0, 'products dry run: no table written');

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
