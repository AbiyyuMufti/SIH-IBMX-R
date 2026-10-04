// Offline checks for the day list (node 1.2) and the day columns (node 5.2).
// The failure path is covered by test-vfc-flow.js.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (name) => readFileSync(new URL(`./vfc/${name}`, import.meta.url), 'utf8');
const ctx = { cfg: { rebuildDays: 2, dayStartHour: 6 } };
const flow = { get: (k) => ctx[k], set: (k, v) => { ctx[k] = v; } };
const node = { status: () => {}, error: (e) => console.log('node.error:', e) };

// ---- node 1.2: the list of production days ----
function runDays(msg, now) {
  const RealDate = Date;
  const FakeDate = class extends RealDate {
    constructor(...a) {
      super(...(a.length ? a : [now]));
    }
    static now() {
      return now;
    }
  };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  return vm.runInNewContext('(function(flow,node,msg,Date){' + read('s1-build-days.js') + '})')(flow, node, msg, FakeDate);
}
const sched = runDays({ payload: 1 }, Date.parse('2026-10-02T07:00:00Z'));
console.log('schedule at 2026-10-02 07:00Z ->', sched[0].map((m) => m.payload + '/' + m.mode).join(', '));
const bf = runDays({ payload: { start: '2026-09-01', end: '2026-09-03' } }, Date.now());
console.log('backfill ->', bf[0].map((m) => m.payload).join(', '));
console.log('bad range ->', runDays({ payload: { start: '2026-09-05', end: '2026-09-03' } }, Date.now()));

// ---- node 5.2: production_day and local_date ----
const dayFieldsSource = read('s5-day-fields.js');
function fieldsOf(iso) {
  const msg = { kpiRows: [{ period_start: iso }], lossRows: [] };
  vm.runInNewContext('(function(flow,node,msg){' + dayFieldsSource + '})')(flow, node, msg);
  return msg.kpiRows[0];
}
const at = (iso) => fieldsOf(iso);
console.log('production_day of 2026-09-30T05:59Z:', at('2026-09-30T05:59:00Z').production_day, '| of 06:00Z:', at('2026-09-30T06:00:00Z').production_day);
console.log('local_date of 2026-07-01T23:30Z (BST):', at('2026-07-01T23:30:00Z').local_date, '| of 2026-12-01T23:30Z (GMT):', at('2026-12-01T23:30:00Z').local_date);

// The London offset itself, taken out of the same node code (cut before the last two calls).
const helpers = dayFieldsSource.replace(/\naddDays\(msg\.kpiRows[\s\S]*$/, '\nreturn { londonOffsetHours: londonOffsetHours };\n');
const { londonOffsetHours } = vm.runInNewContext('(function(flow){' + helpers + '})')(flow);
const ms = (s) => Date.parse(s);
console.log(
  'DST switch 2026-03-29T00:59Z/01:00Z offsets:', londonOffsetHours(ms('2026-03-29T00:59:00Z')), londonOffsetHours(ms('2026-03-29T01:00:00Z')),
  '| 2026-10-25T00:59Z/01:00Z:', londonOffsetHours(ms('2026-10-25T00:59:00Z')), londonOffsetHours(ms('2026-10-25T01:00:00Z'))
);
