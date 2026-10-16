// Offline test of the lake watcher: tab flows/vfc-pbi-listener.json (subscribe
// object -> event parsers -> collect -> release -> global jobQueue) and the
// node that takes a job in flows/vfc-pbi-report.json. The function code is
// run with fake flow and global contexts, no network.
// Usage: node scripts/test-vfc-pbi-listener.js
import { readFileSync } from 'node:fs';

const readFlow = (name) => JSON.parse(readFileSync(
  new URL(`../flows/${name}`, import.meta.url), 'utf8'));
const flowJson = readFlow('vfc-pbi-listener.json');
const reportJson = readFlow('vfc-pbi-report.json');
// The global context is shared by all tabs.
const globalCtx = new Map();
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
  const glob = {
    get: (k) => globalCtx.get(k),
    set: (k, v) => globalCtx.set(k, v)
  };
  const node = { status: () => {}, error: () => {}, warn: () => {} };
  const body = edit(code(file));
  return new Function('msg', 'flow', 'glob', 'node', body)(msg, flow, glob,
    node);
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
const jobs = globalCtx.get('jobQueue').slice();
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
check(out[0].length === jobs.length && /listener/.test(out[0][0].payload),
'release: one log line per job');
const again = run('w3-release.js', {}, ctx);
check(again[0].length === 0 && globalCtx.get('jobQueue').length === jobs.length,
'release: a second check right after queues nothing');

// ---- the report tab takes the jobs one by one
const first = run('w6-take-job.js', {});
check(first && first.payload === jobs[0] &&
  globalCtx.get('jobQueue').length === jobs.length - 1,
'take job: the oldest job leaves the queue, one per tick');
while (globalCtx.get('jobQueue').length) {
  run('w6-take-job.js', {});
}
check(run('w6-take-job.js', {}) === null, 'take job: an empty queue sends nothing');

// ---- JOB DONE watch
globalCtx.delete('lastLog');
check(run('w5-check-quiet.js', {}) === null,
'job done: nothing before the first log line');
run('w4-note-log.js', {});
check(run('w5-check-quiet.js', {}) === null,
'job done: a log line just now is not quiet yet');
globalCtx.set('lastLog', Date.now() - 45000);
globalCtx.set('done', false);
const quiet = run('w5-check-quiet.js', {});
check(quiet && /JOB DONE/.test(quiet.payload),
'job done: 45 s without a log line is reported');
check(run('w5-check-quiet.js', {}) === null,
'job done: reported once only');
run('w4-note-log.js', {});
check(globalCtx.get('done') === false,
'job done: the next log line re-arms it');

// ---- the generated flow
const byName = (n) => flowJson.find((x) => x.name === n);
const src = byName('Source files changed');
const refSub = byName('Reference files changed');
check(src && src.type === 'subscribe object' &&
  src.path === '/eu_report/pbi_report/source/',
'flow: the source subscribe node watches the source folder');
check(refSub && refSub.path === '/eu_report/reference/',
'flow: the reference subscribe node watches the reference folder');
const reportByName = (n) => reportJson.find((x) => x.name === n);
const settings = reportByName('1.1 TASK SETTINGS (edit here)');
const take = reportByName('1.0 Take queued job');
const poll = reportByName('Job queue check every 10 s');
check(take && settings && take.wires[0][0] === settings.id &&
  poll && poll.wires[0][0] === take.id && poll.repeat === '10',
'flow: a clock and node 1.0 feed node 1.1 like the inject');
check(reportJson.some((x) => /Note last log line$/.test(x.name || '')),
'flow: the report tab notes every log line for the JOB DONE watch');
check(reportJson.length < 200 && flowJson.length < 200,
`flow: both tabs stay under the 200 node limit (${reportJson.length}, ` +
  `${flowJson.length})`);
const clock = byName('Release check every 30 s');
check(clock && clock.repeat === '30',
'flow: the release clock runs every 30 s');
const delayNode = reportJson.find((x) => x.type === 'delay' &&
  x.name === 'One month per 5 s');
check(delayNode && delayNode.nbRateUnits === '5',
'flow: the daily loss months go 5 s apart (memory)');
const outputs = ['eu_report/pbi_report/report', 'reports'];
check(![src.path, refSub.path].some((p) =>
  outputs.some((o) => p.indexOf('/' + o + '/') === 0)),
'flow: the watched folders do not contain the output folders (no loop)');

console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
