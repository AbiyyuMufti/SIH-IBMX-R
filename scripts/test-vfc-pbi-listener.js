// Offline test of the lake watcher nodes of flows/vfc-pbi-report.json
// (subscribe object -> event parsers -> collect -> release -> job).
// The function code is run with a fake flow context, no network.
// Usage: node scripts/test-vfc-pbi-listener.js
import { readFileSync } from 'node:fs';

const flowJson = JSON.parse(readFileSync(
  new URL('../flows/vfc-pbi-report.json', import.meta.url), 'utf8'));
const code = (file) => readFileSync(
  new URL(`./vfc/${file}`, import.meta.url), 'utf8');

let failures = 0;
const check = (ok, text) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + text);
  if (!ok) failures++;
};

// Runs a function node code once. Returns what the node returned.
function run(file, msg, store, edit = (c) => c) {
  const ctx = store || new Map();
  const flow = {
    get: (k) => ctx.get(k),
    set: (k, v) => ctx.set(k, v)
  };
  const node = { status: () => {}, error: () => {}, warn: () => {} };
  const body = edit(code(file));
  return new Function('msg', 'flow', 'node', body)(msg, flow, node);
}

const SOURCE = '/eu_report/pbi_report/source/';
const REF = '/eu_report/reference/';
const sourceEvent = (type, site, month, eventType = 'MODIFY', ext = 'csv') => ({
  payload: {
    eventType,
    path: `${SOURCE}${type}/site=${site}/${type}_${month}.${ext}`,
    tenant: 'reckitt'
  }
});

// ---- event parsers
let e = run('w1-source-event.js', sourceEvent('plan_opt', 'Hull', '2026-09'));
check(e && e.event.kind === 'source' && e.event.type === 'plan_opt' &&
  e.event.site === 'Hull' && e.event.month === '2026-09',
'source event: plan_opt Hull 2026-09 is read from the path');
e = run('w1-source-event.js', sourceEvent('plan_opt', 'Hull', '2026-09',
  'DELETE'));
check(e === null, 'source event: a DELETE is dropped');
e = run('w1-source-event.js', sourceEvent('plan_opt', 'Hull', '2026-09',
  'MODIFY', 'xlsx'));
check(e === null, 'source event: a file that is not .csv is dropped');
e = run('w1-source-event.js', {
  payload: {
    eventType: 'MODIFY',
    path: `${SOURCE}plan_opt/site=Hull/`
  }
});
check(e === null, 'source event: a folder event is dropped');
e = run('w1-source-event.js', {
  payload: {
    eventType: 'MODIFY',
    path: `${SOURCE}other_type/site=Hull/other_type_2026-09.csv`
  }
});
check(e === null, 'source event: an unknown type is dropped');
e = run('w1-source-event.js', {
  payload: {
    eventType: 'MODIFY',
    path: `/data/ten=reckitt${SOURCE}line_losses/site=Weinheim/` +
      'line_losses_2025-01.csv'
  }
});
check(e && e.event.site === 'Weinheim' && e.event.month === '2025-01',
'source event: a path with a tenant prefix works');

e = run('w1-reference-event.js', {
  payload: {
    eventType: 'MODIFY',
    path: `${REF}glidepaths/site=Hull/Hull_Glidepaths.csv`
  }
});
check(e && e.event.kind === 'reference' && e.event.type === 'glidepaths' &&
  e.event.site === 'Hull', 'reference event: glidepaths Hull');
e = run('w1-reference-event.js', {
  payload: {
    eventType: 'MODIFY',
    path: `${REF}format_list/site=All/Format_List.csv`
  }
});
check(e === null, 'reference event: format_list is not used, dropped');
e = run('w1-reference-event.js', {
  payload: {
    eventType: 'DELETE',
    path: `${REF}glidepaths/site=Hull/Hull_Glidepaths.csv`
  }
});
check(e === null, 'reference event: a DELETE is dropped');

// ---- collect
const store = new Map();
const feed = (event) => run('w2-collect.js', { event }, store);
feed({ kind: 'source', type: 'plan_opt', site: 'Hull', month: '2026-09' });
feed({ kind: 'source', type: 'plan_opt', site: 'Hull', month: '2026-09' });
feed({ kind: 'source', type: 'line_losses', site: 'Hull', month: '2026-09' });
const pending = store.get('pending');
const keys = Object.keys(pending);
check(keys.length === 1 && pending[keys[0]].events === 3 &&
  Object.keys(pending[keys[0]].types).length === 2,
'collect: events of one site and month make one entry (3 events, 2 types)');
const firstTime = pending[keys[0]].first;
feed({ kind: 'source', type: 'plan_opt', site: 'Hull', month: '2026-09' });
check(store.get('pending')[keys[0]].first === firstTime,
'collect: the window starts at the first event and stays');

const off = new Map();
run('w2-collect.js', {
  event: { kind: 'source', type: 'plan_opt', site: 'Hull', month: '2026-09' }
}, off, (c) => c.replace('LISTENERS_ON = true', 'LISTENERS_ON = false'));
check(!off.get('pending'), 'collect: LISTENERS_ON false drops the event');

// ---- release
const now = Date.now();
const entry = (age, fields) => ({
  types: {},
  events: 1,
  first: now - age * 1000,
  ...fields
});
const source = (age, site, month, types) => entry(age, {
  kind: 'source',
  site,
  month,
  type: null,
  types: Object.fromEntries(types.map((t) => [t, true]))
});
const reference = (age, type, site) => entry(age, {
  kind: 'reference',
  site,
  type,
  month: undefined
});
const ctx = new Map();
ctx.set('pending', {
  'source|Hull|2026-07': source(130, 'Hull', '2026-07', ['plan_opt']),
  'source|Hull|2026-08': source(130, 'Hull', '2026-08', ['plan_opt']),
  'source|Hull|2026-10': source(130, 'Hull', '2026-10', ['plan_opt']),
  'source|Hull|2026-05': source(130, 'Hull', '2026-05', ['line_losses']),
  'source|Nottingham|2026-09':
    source(60, 'Nottingham', '2026-09', ['plan_opt']),
  'reference|glidepaths|Hull': reference(400, 'glidepaths', 'Hull'),
  'reference|shift_naming|All': reference(400, 'shift_naming', 'All'),
  'reference|machine_names|All': reference(400, 'machine_names', 'All'),
  'reference|equipment_coding|Weinheim':
    reference(200, 'equipment_coding', 'Weinheim')
});
const out = run('w3-release.js', {}, ctx);
const jobs = out[0].map((m) => m.payload);
const find = (test) => jobs.filter(test);
const monthTables = [
  'pbi_plan_opt',
  'pbi_time_utilisation',
  'pbi_daily_losses'
];

check(find((j) => j.sites && j.sites[0] === 'Hull' && j.from === '2026-07' &&
  j.to === '2026-08' && j.tables.join() === monthTables.join()).length === 1,
'release: Hull 2026-07 and 2026-08 (next to each other) are one job');
check(find((j) => j.sites && j.sites[0] === 'Hull' && j.from === '2026-10' &&
  j.to === '2026-10' && j.tables.length === 3).length === 1,
'release: Hull 2026-10 is a separate job (a month is missing between)');
check(find((j) => j.from === '2026-05' &&
  j.tables.join() === 'pbi_daily_losses').length === 1,
'release: a line_losses file alone only rebuilds the daily losses');
check(find((j) => j.sites && j.sites[0] === 'Nottingham').length === 0,
'release: an entry younger than 120 s waits');
check(Object.keys(ctx.get('pending')).join() ===
  'source|Nottingham|2026-09,reference|equipment_coding|Weinheim',
'release: released entries are removed, the two young ones stay');

const thisMonth = new Date(now).toISOString().slice(0, 7);
const glide = find((j) => j.sites && j.sites[0] === 'Hull' &&
  j.tables.length === 3 && j.to === thisMonth && j.from < j.to);
check(glide.length === 1,
'release: a Glidepaths change rebuilds the months back to this month');
const shift = find((j) => j.tables.indexOf('pbi_shift_naming') !== -1);
check(shift.length === 1 && !shift[0].sites && shift[0].tables.length === 4,
'release: the shift names file (site All) rebuilds all sites, no site list');
const names = find((j) => j.tables.join() === 'pbi_machine_names');
check(names.length === 1 && !names[0].from,
'release: machine names is a job with no months');
check(out[1].length === jobs.length && /listener/.test(out[1][0].payload),
'release: one log line per job');
const again = run('w3-release.js', {}, ctx);
check(again[0].length === 0,
'release: a second check right after sends nothing');

// ---- the generated flow
const byName = (n) => flowJson.find((x) => x.name === n);
const src = byName('Source files changed');
const refSub = byName('Reference files changed');
check(src && src.type === 'subscribe object' &&
  src.path === '/eu_report/pbi_report/source/',
'flow: the source subscribe node watches the source folder');
check(refSub && refSub.path === '/eu_report/reference/',
'flow: the reference subscribe node watches the reference folder');
const jobIn = flowJson.find((x) => x.type === 'link in' && x.name === 'JOB');
const settings = byName('1.1 TASK SETTINGS (edit here)');
check(jobIn && jobIn.wires[0][0] === settings.id,
'flow: the JOB link in feeds node 1.1 like the inject');
const clock = byName('Release check every 30 s');
check(clock && clock.repeat === '30',
'flow: the release clock runs every 30 s');
const delayNode = flowJson.find((x) => x.type === 'delay' &&
  x.name === 'One month per 5 s');
check(delayNode && delayNode.nbRateUnits === '5',
'flow: the daily loss months go 5 s apart (memory)');
const outputs = ['eu_report/pbi_report/report', 'reports'];
check(![src.path, refSub.path].some((p) =>
  outputs.some((o) => p.indexOf('/' + o + '/') === 0)),
'flow: the watched folders do not contain the output folders (no loop)');

console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
