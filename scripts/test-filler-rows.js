// Offline test of scripts/vfc/f1-filler-rows.js (filler rows for the
// Tableau blend) on hand-made rows, plus the function-node style checks.
// Usage: node scripts/test-filler-rows.js
import { code } from './lib-flow-builder.js';
import { lintFunction } from './validate-flow.js';

let failed = 0;
const check = (ok, text) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) failed++;
};
const run = (msg, scope = {}) => {
  const context = { scope_Hull: scope };
  const flow = { get: (k) => context[k], set: () => {} };
  return new Function('flow', 'node', 'msg', code('f1-filler-rows.js'))(flow, {}, msg);
};

const line = { SiteName: 'Hull', 'Unique Machine Name': 'A-Hull', Dept: 'Pack', Area: 'Liquids', 'Product Type': 'Bottle' };
const plan = [
  { ...line, Date: '2026-10-01', MachineName: 'A', ShiftName: 'Red', AreaName: 'L', 'In EU Report': true, 'Shift Colour': 'Red', ShiftStartTime: 21600000 },
  { ...line, Date: '2026-10-02', MachineName: 'A', ShiftName: 'Red', AreaName: 'L', 'In EU Report': true, 'Shift Colour': 'Red', ShiftStartTime: 21600000 },
  { ...line, Date: '2026-10-02', MachineName: 'A', ShiftName: null, AreaName: 'L', 'In EU Report': true },
  { ...line, Date: '2026-10-02', MachineName: 'P', ShiftName: 'Day', AreaName: 'L', 'In EU Report': true, 'Shift Colour': 'Pink' },
];
const loss = [
  { ...line, 'Unique Machine Name': 'A-Hull-L', ShiftStartDate: '2026-10-01', MachineName: 'A', ShiftName: 'Red', 'In EU Report': false, 'Shift colour': 'Red', 'Shift Time': '06-14' },
  { ...line, ShiftStartDate: '2026-10-02', MachineName: 'A', ShiftName: 'Blue', 'In EU Report': false, 'Shift colour': 'Blue', 'Shift Time': '14-22' },
  { ...line, ShiftStartDate: '2026-10-03', MachineName: 'A', ShiftName: 'Red', 'In EU Report': false, 'Shift colour': 'Red' },
];
const msg = run({ site: 'Hull', period: '2026-10', plan, loss, loadedAt: 5 },
  { Daily_Losses_EU: { keep: {}, drop: { MachineName: ['P'] } } });

// Losses filler: A Red 02 (own loss rows of A exist) and P Day 02 (none).
check(msg.fillerLoss.length === 2, 'two loss filler rows');
const a = msg.fillerLoss.find((r) => r.MachineName === 'A');
check(a && a.ShiftStartDate === '2026-10-02' && a.ShiftName === 'Red', 'loss filler key A Red 2 Oct');
check(a && a['In EU Report'] === false && a['Unique Machine Name'] === 'A-Hull-L', 'machine columns from the own loss row');
check(a && a['Shift Time'] === '06-14' && a['Shift colour'] === 'Red', 'shift columns from the own row of the same shift');
check(a && a.Duration === 0 && a['Loss Units'] === 0 && a.Value === undefined && a.OEELossLvl3Group === undefined,
  'measures 0, ratio and loss group columns empty');
check(a && a['Data Source'] === 'Filler' && a.loaded_at === 5, 'Data Source Filler, loaded_at');
const p = msg.fillerLoss.find((r) => r.MachineName === 'P');
check(p && p['In EU Report'] === false && p.Dept === 'Pack', 'no own row: scope rule of the table, machine columns of the other table');
check(msg.counts.scopeRule === 1, 'one row from the scope rule');

// Plan filler: A Blue 02 only; A Red 03 is after the last plan day.
check(msg.fillerPlan.length === 1, 'one plan filler row');
const f = msg.fillerPlan[0];
check(f && f.Date === '2026-10-02' && f.ShiftName === 'Blue' && f['In EU Report'] === true,
  'plan filler A Blue 2 Oct, In EU Report of the own plan rows');
check(f && f['Shift Colour'] === 'Blue' && f.ShiftStartTime === null && f.AreaName === 'L', 'shift colour from the loss row, no start time');
check(f && f['Targets Key'] === 'A 01/10/2026' && f['Good Parts'] === 0 && f.OEE === undefined, 'targets key, 0 and null');
check(msg.counts.afterLastDay === 1 && msg.counts.nullShift === 1, 'cut-off and null shift counted');

// A period with one table empty gets no filler.
const none = run({ site: 'Hull', period: '2026-11-05', plan: [], loss, loadedAt: 5 });
check(none.fillerLoss.length === 0 && none.fillerPlan.length === 0, 'no filler when a table has no rows');

const lint = lintFunction(code('f1-filler-rows.js')).errors;
check(lint.length === 0, `function node style: ${lint.join('; ') || 'clean'}`);
if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log('all passed');
