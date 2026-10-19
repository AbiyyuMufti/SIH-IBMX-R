// Offline test of the shift report flow (flows/vfc-rpt-hull.json) against the
// fake Insights Hub: tables, windows, local day start, paths, dry run,
// failures, Config errors, and the ratios of node 7.4 on a synthetic day.
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
// The mock calendar has the Red shift on 1 Oct only (12 h from 06:00 UTC).
const oct = await runFlow(flow, base({ startDay: '2026-10-01', fetchImpl: makeMockFetch('products') }));
const winOct = rowsOf(oct, 'rpt_window').filter((r) => r.asset_name === 'Mock Line A');
const hoursOct = rowsOf(oct, 'rpt_hour').filter((r) => r.asset_name === 'Mock Line A');
const dayOct = winOct.find((r) => r.window_kind === 'day');
const shiftOct = winOct.filter((r) => r.window_kind === 'shift');
const none = hoursOct.filter((r) => r.shift_name === null);
check(shiftOct.length === 1 && shiftOct[0].window_name === 'Red' && shiftOct[0].hours === 12 &&
  shiftOct[0].window_start === ms('2026-10-01T06:00:00Z') && shiftOct[0].window_end === ms('2026-10-01T18:00:00Z'),
  'Red shift window: 12 hours from 06:00 to 18:00 UTC');
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

// The schedule builds the latest finished days (3 days, newest ended 2 h ago).
const sched = await runFlow(flow, base({ write: false, startPayload: {} }));
const wins = [...new Set(kpiWindows(sched).map((w) => w.join('|')))].map((w) => w.split('|').map(ms)).sort();
check(wins.length === 3 && wins.every(([, to]) => to <= Date.now() - 2 * H) &&
  wins[2][1] > Date.now() - 27 * H && wins[1][0] === wins[0][1] && wins[2][0] === wins[1][1],
  'schedule: 3 consecutive finished days, the newest ended at least 2 h ago');

// ---- Config errors stop the flow before any call ----
const badConfig = (from, to) => config.map((n) => (n.type === 'function'
  ? { ...n, func: n.func.replace(from, to) } : n));
for (const [from, to, what] of [
  ["timeZone: 'Europe/London'", "timeZone: 'Europe/Paris'", 'time zone other than Europe/London'],
  ['dayStartLocal: 6', 'dayStartLocal: 1', 'day start 1 (before the clock change)'],
  ['reportLineIds: [', 'reportLinesGone: [', 'no report lines']
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
check(red && red.performance_loss_min === null && red.running_rate !== null && near(red.running_rate, 200 / 60), 'no value stays null, running rate = parts per net production minute');
check(red && red.ran_min === null && red.waiting_min === null, 'group minutes are null in phase 1');

console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exitCode = failures ? 1 : 0;
