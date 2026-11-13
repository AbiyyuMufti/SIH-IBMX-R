// Offline unit test of the EU_OEE_Fact function nodes: b9-rr-fact-rows.js
// (tab PBI report build 2) and e2-fact-rows.js / e3-fact-path.js (tab EU OEE
// Fact write). The whole chain on real days: scripts/local-report-build.js,
// then scripts/eu_oee_fact_flow_check.py (docs/eu-oee-fact-flows.md).
// Usage: node scripts/test-eu-oee-fact.js
import { code } from './lib-flow-builder.js';
import { euOeeFactSchema } from './lib-pbi-report-schemas.js';

const columns = euOeeFactSchema.map(([n]) => `  '${n}'`).join(',\n');
const run = (file, msg, ctx = {}, fix = (t) => t) => {
  const flow = { get: (k) => ctx[k], set: (k, v) => { ctx[k] = v; } };
  const node = { status: () => {}, error: (e) => { throw new Error(e); } };
  return new Function('msg', 'flow', 'node', fix(code(file)))(msg, flow, node);
};
let failed = 0;
const check = (ok, text) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`);
  failed += ok ? 0 : 1;
};
const day = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
const hour = (s) => Date.parse(`${s}Z`);

// ---- b9-rr-fact-rows.js: hours -> shift-day totals ----
const rrCtx = {
  shiftMap: { FriNight: 'Night' },
  formats_Hull: { 'GT4-Hull P1': { Brand: 'B', 'Unit Size': null, 'Unit Count/Format': null, 'Extra Info': null } }
};
const base = { 'Unique Machine Name': 'GT4-Hull', MachineName: 'GT4', PartName: 'P1', 'Shift Colour': 'Pink' };
const rr = run('b9-rr-fact-rows.js', {
  site: 'Hull',
  month: '2026-11-13',
  rows: [
    { ...base, Hour: hour('2026-11-13T22:00:00'), ShiftName: 'FriNight', 'Good Parts': 10, Capacity: 20, 'In EU Report': false, loaded_at: 1 },
    { ...base, Hour: hour('2026-11-14T02:00:00'), ShiftName: 'FriNight', 'Good Parts': 5, Capacity: null, 'In EU Report': true, loaded_at: 3 },
    { ...base, Hour: hour('2026-11-14T07:00:00'), ShiftName: 'Odd name', 'Good Parts': 1, Capacity: 2, 'In EU Report': true, loaded_at: 2 }
  ]
}, rrCtx).rows;
check(rr.length === 2, 'Run Rate: one row per shift-day, line, shift, colour, part');
check(day(rr[0].Date) === '2026-11-13' && rr[0]['RR Hours'] === 2 && rr[0]['RR Good Parts'] === 15 && rr[0]['RR Capacity'] === 20,
  'Run Rate: 02:00 Saturday of FriNight counts on Friday; empty Capacity adds 0');
check(rr[0].ShiftName === 'Night' && rr[0]['In EU Report'] === true && rr[0].loaded_at === 3 && rr[0].Brand === 'B',
  'Run Rate: mapped shift, In EU Report if any hour, newest loaded_at, Format List');
check(day(rr[1].Date) === '2026-11-14' && rr[1].ShiftName === null,
  'Run Rate: a raw name without weekday keeps the hour day, unmapped shift is empty');

// ---- e2-fact-rows.js: mapping to the 65 columns ----
const fix = (t) => t.replace('__COLUMNS__', columns);
const lines = [{ 'Unique Machine Name': 'B1-Hull', Dept: 'D', Area: 'A', 'Product Type': 'T' }];
const loss = run('e2-fact-rows.js', {
  table: 'Daily_Losses_EU',
  site: 'Hull',
  month: '2026-11-10',
  day: '2026-11-13',
  mode: 'report',
  payload: lines,
  rows: [
    { Date: 20767, ShiftStartDate: 20766, 'Unique Machine Name': 'B1-Hull', 'Shift colour': 'Blue', target: 0.07200000000000001, Dept: 'x', 'In EU Report': false, Merged: 'old' },
    { Date: 20767, ShiftStartDate: 20767, 'Unique Machine Name': 'Z-Hull', Dept: 'own', 'In EU Report': true }
  ]
}, {}, fix);
const [l1, l2] = loss[0].rows;
check(Object.keys(l1).join('|') === euOeeFactSchema.map(([n]) => n).join('|'),
  'Fact: every row has the 65 columns in order');
check(l1['Record Type'] === 'Loss' && l1['Event Date'] === 20767 && l1.Date === 20766 && l1['Shift Colour'] === 'Blue',
  'Fact: Loss renames (Date -> Event Date, ShiftStartDate -> Date, Shift colour)');
check(l1['Loss Target'] === 0.072, 'Fact: Loss Target rounded to 6 decimals');
check(l1['In EU Report'] === true && l1['In EU Report Source'] === false && l1.Dept === 'D',
  'Fact: In EU Report and Dept from the line list, the table flag in In EU Report Source');
check(l2['In EU Report'] === false && l2['In EU Report Source'] === true && l2.Dept === 'own',
  'Fact: a line not in the list is out of the EU report, keeps its own Dept');
check(/left out: Merged/.test(loss[1].payload) && loss[0].fileTag === 'loss',
  'Fact: a column EU_OEE_Fact has not is left out and named in the log');
const empty = run('e2-fact-rows.js', {
  table: 'Plan_OPT_EU', site: 'Hull', month: 'm', day: 'd', mode: 'r', payload: [], rows: []
}, {}, fix);
check(empty[0].failed.length === 1, 'Fact: an empty line list fails the item (nothing written)');

// ---- e1-fact-settings.js: month jobs are refused, day jobs go on ----
const glob = { get: () => ({ root: 'eu_report' }) };
const settings = (month) => {
  const flow = { get: () => undefined, set: () => {} };
  const node = { status: () => {}, error: () => {} };
  return new Function('msg', 'flow', 'node', 'glob', code('e1-fact-settings.js'))(
    { month, table: 'Plan_OPT_EU', site: 'Hull', day: 'd', mode: 'r' }, flow, node, glob);
};
const monthJob = settings('2026-10');
const dayJob = settings('2026-11-10');
check(monthJob[0] === null && /SKIPPED/.test(monthJob[1].payload),
  'Settings: a month job writes no fact file (the month files hold it)');
const early = settings('2026-11-09');
check(early[0] === null && /FIRST_DAY/.test(early[1].payload),
  'Settings: a day before FIRST_DAY writes no fact file');
check(settings('2026-11-10_ZEUS')[0] !== null,
  'Settings: a Chartres day (day_line) from FIRST_DAY goes on');
check(dayJob[0].path === 'eu_report/report/Dim/Machine_Names_EU.csv' && dayJob[1] === null,
  'Settings: a day job goes on and reads the line list');

// ---- e3-fact-path.js ----
const p = run('e3-fact-path.js', { out: 'eu_report/report', site: 'Chartres', month: '2026-11-14_ZEUS', fileTag: 'plan', source: 'excel' });
check(p.path === 'eu_report/report/EU_OEE_Fact/site=Chartres/EU_OEE_Fact_2026-11-14_ZEUS_plan_excel.parquet',
  'Path: one file per site, day (and Chartres line), record type and source');

console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
