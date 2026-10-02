// Offline checks for the day list and the London date rule. The failure path is covered by test-vfc-flow.js.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ctx = { cfg: { rebuildDays: 2 } };
const flow = { get: (k) => ctx[k], set: (k, v) => { ctx[k] = v; } };
const node = { status: () => {}, error: (e) => console.log('node.error:', e) };
function run(msg, now) {
  const RealDate = Date;
  const FakeDate = class extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  return vm.runInNewContext('(function(flow,node,msg,Date){' + rd('./vfc/node-build-days.js') + '})')(flow, node, msg, FakeDate);
}
const sched = run({ payload: 1 }, Date.parse('2026-10-02T07:00:00Z'));
console.log('schedule at 2026-10-02 07:00Z ->', sched[0].map((m) => m.payload + '/' + m.mode).join(', '));
const bf = run({ payload: { start: '2026-09-01', end: '2026-09-03' } }, Date.now());
console.log('backfill ->', bf[0].map((m) => m.payload).join(', '));
console.log('bad range ->', run({ payload: { start: '2026-09-05', end: '2026-09-03' } }, Date.now()));

const m = { module: { exports: {} } }; vm.runInNewContext(rd('./vfc-transform.js'), m);
const X = m.module.exports;
const day = (s) => Date.parse(s);
console.log('production_day of 2026-09-30T05:59Z:', X.productionDay(day('2026-09-30T05:59:00Z')), '| of 06:00Z:', X.productionDay(day('2026-09-30T06:00:00Z')));
console.log('london date of 2026-07-01T23:30Z (BST):', X.londonDate(day('2026-07-01T23:30:00Z')), '| of 2026-12-01T23:30Z (GMT):', X.londonDate(day('2026-12-01T23:30:00Z')));
console.log('DST switch 2026-03-29T00:59Z/01:00Z offsets:', X.londonOffsetHours(day('2026-03-29T00:59:00Z')), X.londonOffsetHours(day('2026-03-29T01:00:00Z')), '| 2026-10-25T00:59Z/01:00Z:', X.londonOffsetHours(day('2026-10-25T00:59:00Z')), X.londonOffsetHours(day('2026-10-25T01:00:00Z')));

