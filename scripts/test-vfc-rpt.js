// Offline test of the shift report flow (flows/vfc-rpt-hull.json) against the
// fake Insights Hub: tables, windows, local day start, paths, dry run,
// failures, Config errors, machines found automatically (exclusions, group
// minutes, two lines) and the ratios of node 7.4 on a synthetic day.
// Usage: node scripts/test-vfc-rpt.js platform=legacy|xcelerator
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { runFlow, testPlatform } from './lib-vfc-runner.js';
import { makeMockFetch } from './lib-mock-ih.js';
import { code } from './lib-flow-builder.js';

const read = (f) => JSON.parse(readFileSync(new URL('../flows/' + f, import.meta.url), 'utf8'));
const config = read('vfc-config.json');
const flow = read('vfc-rpt-hull.json');
const day = '2026-09-30';
const H = 3600000;
const base = (extra) => ({
  startDay: day, write: true, configNodes: config, lake: new Map(),
  platform: testPlatform(),
  fetchImpl: makeMockFetch('ok'), clientId: 'x', clientSecret: 'y',
  allAssets: true, ...extra
});

let failures = 0;
const check = (ok, text) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) {
    failures++;
  }
};
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;
const W = (t) => `Write ${t} parquet`;
const rowsOf = (stats, t) => (stats.parquetPayloads[W(t)] || []).flat();
const ms = (iso) => Date.parse(iso);
// The evaluateKPIs requests that are not filtered on a product or an order.
const kpiWindows = (stats) => stats.requests
  .filter((q) => q.url.endsWith('/evaluateKPIs') && !/"value":\["/.test(q.body))
  .map((q) => JSON.parse(q.body).scope)
  .map((s) => [s.from, s.to]);

// ---- products scenario: all three tables ----
const prod = await runFlow(flow, base({ fetchImpl: makeMockFetch('products') }));
prod.errors.forEach((e) => console.log('ERROR:', e));
prod.logs.forEach((l) => console.log('LOG:', String(l).slice(0, 200)));
check(prod.errors.length === 0, 'no error');
const win = rowsOf(prod, 'rpt_window');
const hour = rowsOf(prod, 'rpt_hour');
const event = rowsOf(prod, 'rpt_event');
check(win.length > 0 && hour.length > 0 && event.length > 0,
  `three tables: ${win.length} windows, ${hour.length} hours, ${event.length} events`);
const keys = ['site', 'line_id', 'line_name', 'asset_id', 'asset_name', 'asset_level', 'production_day'];
check([win, hour, event].every((rows) => rows.every((r) => keys.every((k) => k in r))),
  'every table has the key columns');
check([win, hour, event].every((rows) => rows.every((r) => r.asset_level === 'line' && r.production_day === day)),
  'phase 1: asset level line, production day set');

// Local day start: 06:00 local in September (BST) = 05:00 UTC.
const from = ms('2026-09-30T05:00:00Z');
const dayA = win.find((r) => r.asset_name === 'Mock Line A' && r.window_kind === 'day');
check(dayA && dayA.window_start === from && dayA.window_end === from + 24 * H,
  'day window of 2026-09-30 is 05:00 UTC to 05:00 UTC (06:00 local)');
check(kpiWindows(prod).every(([f]) => f === '2026-09-30T05:00:00.000Z'),
  'the KPI requests use the local day window');
check(prod.requests.some((q) => /downtimeReasons\?from=2026-09-30T05%3A00%3A00.000Z/.test(q.url)),
  'the stops request uses the local day window');

// Hours.
const hoursA = hour.filter((r) => r.asset_name === 'Mock Line A');
check(hoursA.length === 24, 'A: 24 hour rows');
const h0 = hoursA.find((r) => r.hour_start === from);
check(h0 && h0.local_time === '06:00' && h0.local_date === day, 'A hour 0: local time 06:00 on the day');
check(h0 && h0.product_key === '1001' && h0.batch_id === 'O-1', 'A hour 0: product 1001, order O-1');
check(hoursA.every((r) => r.hour_end === r.hour_start + H), 'hour end = start + 1 h');

// Windows against the hours.
const sum = (rows, k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
check(dayA && near(dayA.total_parts, sum(hoursA, 'total_parts')) && near(dayA.good_parts, sum(hoursA, 'good_parts')),
  'A: day window parts = sum of the hour rows');
// The mock calendar has the Red shift on 1 Oct only: 12 h from 06:00 local
// (the rule holds a wall clock time with a Z), so 05:00 to 17:00 UTC in BST.
const oct = await runFlow(flow, base({ startDay: '2026-10-01', fetchImpl: makeMockFetch('products') }));
const winOct = rowsOf(oct, 'rpt_window').filter((r) => r.asset_name === 'Mock Line A');
const hoursOct = rowsOf(oct, 'rpt_hour').filter((r) => r.asset_name === 'Mock Line A');
const evOct = rowsOf(oct, 'rpt_event').filter((r) => r.asset_name === 'Mock Line A');
const dayOct = winOct.find((r) => r.window_kind === 'day');
const shiftOct = winOct.filter((r) => r.window_kind === 'shift');
const none = hoursOct.filter((r) => r.shift_name === null);
check(shiftOct.length === 1 && shiftOct[0].window_name === 'Red' && shiftOct[0].hours === 12 &&
  shiftOct[0].window_start === ms('2026-10-01T05:00:00Z') && shiftOct[0].window_end === ms('2026-10-01T17:00:00Z'),
  'Red shift window: 12 hours from 05:00 to 17:00 UTC (06:00 to 18:00 local)');
check(hoursOct[0].shift_name === 'Red' && hoursOct[11].shift_name === 'Red' && hoursOct[12].shift_name === null,
  'hours 05:00 to 16:00 UTC are in the Red shift, 17:00 is not');
check(evOct.every((r) => r.shift_name === (r.event_start < ms('2026-10-01T17:00:00Z') ? 'Red' : null)),
  'a stop gets the shift of its local time');
check(near(sum(shiftOct, 'total_parts') + sum(none, 'total_parts'), dayOct.total_parts),
  'shift window plus the hours outside a shift add up to the day');
check(dayA && near(dayA.capacity_units, 210 * 360 + 200 * 360),
  'A: capacity = design speed per minute x operational minutes, per hour');

// Events.
const evA = event.filter((r) => r.asset_name === 'Mock Line A');
check(evA.length === 5, `A: 5 stops inside the day (2 outside dropped), got ${evA.length}`);
const kind = (reason) => (evA.find((r) => r.reason === reason) || {}).event_kind;
check(kind('##MICROSTOPS##') === 'microstop' && kind('Cleaning') === 'planned' &&
  kind('Jam') === 'unplanned' && kind('Open stop') === 'planned', 'event kinds: microstop, planned, unplanned');
const jam = evA.find((r) => r.reason === 'Jam');
check(jam && near(jam.loss_units, 25 * 210) && jam.product_key === '1001' && jam.batch_id === 'O-1',
  'Jam: loss units 25 min x 210, product and order of its hour');
const open = evA.find((r) => r.reason === 'Open stop');
check(open && open.minutes === null && open.event_end === null, 'open stop: no minutes, no end');
check(jam && jam.reason_full_path === 'Unplanned / Mechanical / Jam' && jam.comment_count === 3, 'reason path and comment count kept');

// Paths.
const paths = [...prod.written].filter((p) => !p.includes('/logs/'));
for (const t of ['rpt_window', 'rpt_hour', 'rpt_event']) {
  check(paths.some((p) => p.endsWith(`/shift_report/${t}/site=Hull/${t}_${day}.parquet`)), `path of ${t}`);
}

// ---- other scenarios ----
const dry = await runFlow(flow, base({ write: false, fetchImpl: makeMockFetch('products') }));
check(Object.keys(dry.parquetRows).length === 0 && dry.logs.some((l) => /DRY RUN/.test(String(l))),
  'dry run: nothing written, DRY RUN in the log');
for (const scenario of ['kpi-413', 'stops-fail', 'details-fail', 'kpi-fail', 'stops-paged',
  'values-fail', 'products-fail', 'value-kpi-fail']) {
  const s = await runFlow(flow, base({ fetchImpl: makeMockFetch(scenario) }));
  check(Object.keys(s.parquetRows).length === 0 && s.logs.some((l) => /FAILED, NOTHING WRITTEN/.test(String(l))),
    `${scenario}: nothing written, FAILED in the log`);
}
for (const scenario of ['token-fail', 'list-fail', 'empty']) {
  const s = await runFlow(flow, base({ fetchImpl: makeMockFetch(scenario) }));
  check(Object.keys(s.parquetRows).length === 0, `${scenario}: nothing written`);
}
// ---- evaluateKPIs 413 on the day window: hourly fallback ----
{
  const masked = (s) => JSON.stringify(s.parquetPayloads).replace(/"loaded_at":\d+/g, '"loaded_at":0');
  const kpiCalls = (s) => s.requests.filter((q) => q.url.endsWith('/evaluateKPIs'));
  const hourly = (s) => kpiCalls(s).filter((q) => {
    const sc = JSON.parse(q.body).scope;
    return Date.parse(sc.to) - Date.parse(sc.from) === 3600000;
  });
  const normal = await runFlow(flow, base({ fetchImpl: makeMockFetch('ok') }));
  const big = await runFlow(flow, base({ fetchImpl: makeMockFetch('kpi-413-day') }));
  check(big.errors.length === 0 && masked(big) === masked(normal),
    '413 on the day: the hourly parts give the same rows as a normal day');
  check(hourly(big).length === 24 && /KPIs in 24 hourly parts \(413 on the day\)/.test(big.logs.map(String).join('\n')),
    '413 on the day: 24 hourly calls, the log says so');
  const normalP = await runFlow(flow, base({ fetchImpl: makeMockFetch('products') }));
  const bigP = await runFlow(flow, base({ fetchImpl: makeMockFetch('value-413-day') }));
  check(bigP.errors.length === 0 && masked(bigP) === masked(normalP),
    '413 on a product call: the hourly parts give the same rows');
  check(hourly(bigP).length === 24 && hourly(bigP).every((q) => /"PRODUCT","value":\["1002"\]/.test(q.body)),
    '413 on a product call: 24 hourly calls filtered on that product');
  const still = await runFlow(flow, base({ fetchImpl: makeMockFetch('kpi-413') }));
  check(Object.keys(still.parquetRows).length === 0 &&
    /FAILED, NOTHING WRITTEN: .*HTTP 413: also on 1 h windows/.test(still.logs.map(String).join('\n')),
    '413 on the hourly calls too: nothing written, the log says "also on 1 h windows"');
  check(hourly(normal).length === 0 && kpiCalls(normal).length === kpiCalls(await runFlow(flow, base({ fetchImpl: makeMockFetch('ok') }))).length,
    'a normal day makes no hourly call');
}

const plain = await runFlow(flow, base());
check(plain.errors.length === 0 && rowsOf(plain, 'rpt_hour').length > 0, 'a day without products still writes the tables');

// ---- the local day: winter, and the two clock changes ----
const windowOf = async (d) => {
  const s = await runFlow(flow, base({ startDay: d, write: false }));
  const w = kpiWindows(s)[0];
  return w ? [ms(w[0]), ms(w[1])] : null;
};
const winter = await windowOf('2026-12-10');
check(winter && winter[0] === ms('2026-12-10T06:00:00Z') && winter[1] === ms('2026-12-11T06:00:00Z'),
  'winter: 06:00 UTC to 06:00 UTC');
const autumn = await windowOf('2026-10-24');
check(autumn && autumn[1] - autumn[0] === 25 * H && autumn[1] === ms('2026-10-25T06:00:00Z'),
  'day before the clock goes back (24 Oct): 25 hours, ends 06:00 UTC');
const spring = await windowOf('2026-03-28');
check(spring && spring[1] - spring[0] === 23 * H && spring[1] === ms('2026-03-29T05:00:00Z'),
  'day before the clock goes forward (28 Mar): 23 hours, ends 05:00 UTC');

// Another time zone: Weinheim time (Europe/Berlin), day start 06:00 local.
const berlin = config.map((n) => (n.type === 'function'
  ? { ...n, func: n.func.replace("timeZone: 'Europe/London',\n      runHourLocal", "timeZone: 'Europe/Berlin',\n      runHourLocal") } : n));
const berlinWindow = async (d) => {
  const s = await runFlow(flow, base({ startDay: d, write: false, configNodes: berlin }));
  const w = kpiWindows(s)[0];
  return w ? [ms(w[0]), ms(w[1])] : null;
};
const bSummer = await berlinWindow('2026-09-16');
const bWinter = await berlinWindow('2026-12-10');
check(bSummer && bSummer[0] === ms('2026-09-16T04:00:00Z') && bWinter && bWinter[0] === ms('2026-12-10T05:00:00Z'),
  'Europe/Berlin: 06:00 local is 04:00 UTC in summer, 05:00 UTC in winter');

// The schedule builds the latest finished days (3 days, the newest has ended;
// the tab runs at runHourLocal, so no grace).
// The tick goes on only in runHourLocal: set it to the London hour of now.
const lastSun = (y, m) => {
  const d = new Date(Date.UTC(y, m + 1, 0, 1));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
};
const y = new Date().getUTCFullYear();
const inBst = Date.now() >= lastSun(y, 2) && Date.now() < lastSun(y, 9);
const hourNow = (new Date().getUTCHours() + (inBst ? 1 : 0)) % 24;
const dueConfig = config.map((n) => (n.type === 'function'
  ? { ...n, func: n.func.replace('runHourLocal: 6', `runHourLocal: ${hourNow}`) } : n));
const notDue = await runFlow(flow, base({ write: false, startPayload: {},
  configNodes: config.map((n) => (n.type === 'function'
    ? { ...n, func: n.func.replace('runHourLocal: 6', `runHourLocal: ${(hourNow + 1) % 24}`) } : n)) }));
check(notDue.requests.length === 0, 'tick outside runHourLocal: nothing runs');
const sched = await runFlow(flow, base({ write: false, startPayload: {}, configNodes: dueConfig }));
const wins = [...new Set(kpiWindows(sched).map((w) => w.join('|')))].map((w) => w.split('|').map(ms)).sort();
check(wins.length === 3 && wins.every(([, to]) => to <= Date.now()) &&
  wins[2][1] > Date.now() - 25 * H && wins[1][0] === wins[0][1] && wins[2][0] === wins[1][1],
  'schedule: 3 consecutive finished days, the newest ended less than 25 h ago');

// ---- machines: found automatically, exclusions, group minutes ----
const REAL_LINE = 'cf4565d7da1e4efcbc0ea6a4814b8eee';
const A1 = 'a'.repeat(32);
const A2 = 'b'.repeat(32);
const withConfig = (edit) => config.map((n) => (n.type === 'function'
  ? { ...n, func: edit(n.func.replaceAll(REAL_LINE, A1)) } : n));
const mach = (extra) => base({
  startDay: '2026-10-01', allAssets: false, configNodes: withConfig((f) => f),
  fetchImpl: makeMockFetch('machines'), ...extra
});
const m = await runFlow(flow, mach());
m.errors.forEach((e) => console.log('ERROR machines:', e));
check(m.errors.length === 0, 'machines: no error');
const mWin = rowsOf(m, 'rpt_window');
const mHour = rowsOf(m, 'rpt_hour');
const names = [...new Set(mWin.map((r) => r.asset_name))].sort();
check(JSON.stringify(names) === JSON.stringify(['Mock Filler', 'Mock Labeller', 'Mock Line A']),
  `the line and its two OEE machines are in, the cabinet (no OEE asset) is not: ${names.join(', ')}`);
const mDay = (n) => mWin.find((r) => r.asset_name === n && r.window_kind === 'day');
const mShift = (n) => mWin.find((r) => r.asset_name === n && r.window_kind === 'shift');
check(mDay('Mock Filler').asset_level === 'machine' && mDay('Mock Line A').asset_level === 'line',
  'asset level: machine and line');
check(mWin.every((r) => r.line_id === A1 && r.line_name === 'Mock Line A'),
  'machine rows carry the line id and the line name');
check(mHour.filter((r) => r.asset_name === 'Mock Filler').every((r) => r.line_id === A1),
  'machine hour rows carry the line id');
const d = mDay('Mock Filler');
check(near(d.ran_min, 1080) && near(d.waiting_min, 120) && near(d.fault_min, 60) &&
  near(d.planned_min, 60) && near(d.other_min, 120) && d.operator_min === null,
  'machine day: ran 1080, waiting 120, faults 60, planned 60, other 120 (no category + Other), operator null');
check(near(d.ran_min + d.waiting_min + d.fault_min + d.planned_min + d.other_min, 1440),
  'the groups add up to the 24 hours of the day');
const sh = mShift('Mock Filler');
check(sh && sh.window_name === 'Red' && near(sh.ran_min, 360) && near(sh.waiting_min, 120) &&
  near(sh.fault_min, 60) && near(sh.planned_min, 60) && near(sh.other_min, 120),
  'machine shift window: the segments are cut to the shift (12 h)');
check(mWin.filter((r) => r.asset_name === 'Mock Line A').every((r) => r.ran_min === null && r.fault_min === null),
  'the line rows keep empty group minutes');
check(m.requests.filter((q) => /timeModelCategoryDistribution$/.test(q.url)).length === 2,
  'time segments asked for the two machines only, not for the line');
check(mHour.filter((r) => r.asset_name === 'Mock Labeller').every((r) => r.batch_id === 'O-7') &&
  mHour.filter((r) => r.asset_name === 'Mock Filler').every((r) => r.batch_id === null),
  'a machine has its own orders (Labeller O-7, Filler none)');
check(m.requests.filter((q) => /assetmanagement.*\/assets\?/.test(q.url)).length === 1,
  'one machine list request for the one line');
check(Object.keys(m.parquetRows).length === 3 && m.written.filter((p) => !p.includes('/logs/')).length === 3,
  'the day is written once: three files');

// A busy day: 1800 stops for each of the 3 assets must not break the flow
// (the VFC refuses a context value over 2 MB, the runner has the same limit).
const big = await runFlow(flow, mach({ fetchImpl: makeMockFetch('machines-big') }));
big.errors.forEach((e) => console.log('ERROR big:', e));
check(big.errors.length === 0 && rowsOf(big, 'rpt_event').length === 3 * 1800,
  `busy day: no error, ${rowsOf(big, 'rpt_event').length} event rows written`);
check(big.maxContextBytes < 100000,
  `no rows kept in the flow context (largest value ${big.maxContextBytes} bytes, the limit is 2097152)`);

// Exclusion: the commented line of the Config tab, switched on.
const ex = await runFlow(flow, mach({
  configNodes: withConfig((f) => f.replace("// '05 Antares'", "'Mock Filler'"))
}));
const exNames = [...new Set(rowsOf(ex, 'rpt_window').map((r) => r.asset_name))].sort();
check(JSON.stringify(exNames) === JSON.stringify(['Mock Labeller', 'Mock Line A']) &&
  ex.logs.some((l) => /Mock Filler excluded/.test(String(l))),
  'reportExcludeNames: the excluded machine is left out and the log says so');

// Two lines in one day: still one write, both lines in the files.
const two = await runFlow(flow, mach({
  configNodes: withConfig((f) => f.replace('lines: [',
    `lines: [{ id: '${A2}', sih: 'Mock Line B', report: 'B', shiftReport: true },`))
}));
const twoNames = [...new Set(rowsOf(two, 'rpt_window').map((r) => r.asset_name))].sort();
check(twoNames.includes('Mock Line B') && twoNames.includes('Mock Filler') &&
  two.written.filter((p) => !p.includes('/logs/')).length === 3,
  `two lines and their machines in one write of three files: ${twoNames.join(', ')}`);

for (const [scenario, text] of [['segments-fail', 'time segments failed'], ['children-fail', 'machine list failed']]) {
  const f = await runFlow(flow, mach({ fetchImpl: makeMockFetch(scenario) }));
  check(Object.keys(f.parquetRows).length === 0 && f.logs.some((l) => new RegExp(`FAILED, NOTHING WRITTEN.*${text}`).test(String(l))),
    `${scenario}: nothing written, FAILED (${text}) in the log`);
}

// ---- Config errors stop the flow before any call ----
const badConfig = (from, to) => config.map((n) => (n.type === 'function'
  ? { ...n, func: n.func.replace(from, to) } : n));
for (const [from, to, what] of [
  ["timeZone: 'Europe/London',\n      runHourLocal", "timeZone: 'Mars/Base',\n      runHourLocal", 'a time zone not in TIME_ZONES'],
  ['dayStartLocal: 6', 'dayStartLocal: 3', 'day start 3 (before 04:00)'],
  ['shiftReport: true', 'shiftReport: false', 'no shift report lines'],
  ["report: 'GT4'", "report: '?'", 'a line without its report name']
]) {
  const s = await runFlow(flow, base({ configNodes: badConfig(from, to) }));
  check(s.requests.length === 0 && s.errors.length > 0 && Object.keys(s.parquetRows).length === 0,
    `${what}: stops with an error, no call`);
}

// ---- node 7.4 on a synthetic day: sums, ratios, shift runs ----
const t0 = ms('2026-09-16T05:00:00Z');
const hr = (i, shift, v) => ({
  ms: t0 + i * H, shift, perMinute: 2,
  values: {
    total_parts: 100, good_parts: 90, rejected_parts: 10, theoretical_output: 200,
    total_time_ms: H, operational_time_ms: H, net_production_time_ms: H / 2,
    availability_losses_ms: H / 2, downtime_ms: H / 4, micro_stops_ms: 60000,
    performance_losses_ms: null, ...v
  }
});
const winMsg = {
  day: '2026-09-16', dayFromMs: t0, dayToMs: t0 + 24 * H,
  asset: { id: 'A' }, h: { site: 'Hull', line: 'B2 Line', machine: null, asset_name: 'B2 Line' },
  hours: [
    hr(0, 'Red'), hr(1, 'Red'), hr(2, null), hr(3, 'Blue'),
    hr(5, 'Blue', { total_parts: null, good_parts: null })
  ]
};
const node = { status: () => {}, error: () => {} };
const out = vm.runInNewContext('(function(msg,flow,node){' + code('q7-window-rows.js') + '\n})', {})(winMsg, { get: () => ({}) }, node);
const dayRow = out.windowRows.find((r) => r.window_kind === 'day');
const red = out.windowRows.find((r) => r.window_name === 'Red');
const blue = out.windowRows.filter((r) => r.window_name === 'Blue');
check(out.windowRows.length === 4, 'one day window and three shift runs (Red, Blue, Blue after a gap)');
check(red && red.hours === 2 && red.window_start === t0 && red.window_end === t0 + 2 * H, 'Red run: 2 hours, start and end');
check(blue.length === 2 && blue[0].hours === 1 && blue[1].hours === 1, 'a gap in the hours splits a shift run');
check(red && near(red.availability, 0.5) && near(red.performance, 0.5) && near(red.quality, 0.9) && near(red.oee, 0.5 * 0.5 * 0.9),
  'ratios from sums: availability net/operational, performance total/theoretical, quality good/total, OEE product');
check(dayRow && near(dayRow.good_parts, 360) && near(dayRow.total_parts, 400), 'a null hour adds nothing to the sums');
check(red && near(red.capacity_units, 2 * 120) && near(red.availability_loss_units, 2 * 60), 'capacity and loss units = design speed x minutes of each hour');
check(red && near(red.running_rate, 200 / 60), 'running rate = parts per net production minute');
check(red && near(red.performance_loss_min, 30) && near(red.quality_loss_min, 3) && near(red.used_operational_min, 27),
  'loss times from the window ratios: (1 - performance) x net, (1 - quality) x (net - performance loss)');
check(red && near(red.performance_loss_units, 30 * 2) && near(red.quality_loss_units, 3 * 2), 'performance and quality loss units = loss minutes x average design speed');
check(red && red.ran_min === null && red.waiting_min === null, 'group minutes are null in phase 1');

console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exitCode = failures ? 1 : 0;
