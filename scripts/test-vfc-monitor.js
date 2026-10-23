// Tests live run-status checkpoints and unchanged report behavior.
// In: mock Insights Hub responses and the selected platform.
// Out: a failure exit code if any status or behavior assertion fails.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { runFlow, testPlatform } from './lib-vfc-runner.js';
import { makeMockFetch } from './lib-mock-ih.js';
import { code } from './lib-flow-builder.js';
import { validateFlow, checkMonitorFlows } from './validate-flow.js';
import { MONITOR_FLOWS } from './monitor-flows.js';

const platform = testPlatform();
const BASELINE_COMMIT = '358ddb162bd12970709e97f8083a175f779dcf4c';
const read = (file) => JSON.parse(
  readFileSync(new URL('../flows/' + file, import.meta.url), 'utf8')
);
const readBaseline = (file) => JSON.parse(execFileSync(
  'git',
  ['show', BASELINE_COMMIT + ':flows/' + file],
  { encoding: 'utf8' }
));
const config = read('vfc-config.json');
const day = '2026-09-30';
const ref = 'eu_report/reference';
const lake = () => new Map([
  [`${ref}/glidepaths/site=Hull/Glidepath Hull.csv`, [
    'Site Name,Line,OEE Bucket,01/09/2026',
    'Hull,B2 Auto,% OEE,55',
    'Hull,B2 Auto,Planned Downtime (Total),12.5',
    'Hull,B2 Auto,Unplanned Downtime (Total),20',
    'Hull,B2 Auto,Unplanned,3',
    ''
  ].join('\n')],
  [`${ref}/machine_names/site=Hull/Hull_MachineNames.csv`, [
    'MachineName,Dept,Area,Product Type',
    'B2 Auto,Liquids Pack,Liquids,Bottles',
    'GT4 - Auto,Dries Pack,Dries,Blisters',
    ''
  ].join('\n')],
  [`${ref}/shift_naming/site=All/Shift Patterns.csv`, [
    'ShiftName,Shift',
    'MonDay,Day',
    ''
  ].join('\n')]
]);

let failures = 0;
function check(ok, text) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) {
    failures++;
  }
}

function vmFunction(fileName, replacements) {
  let source = code(fileName);
  Object.entries(replacements).forEach(([from, to]) => {
    source = source.replaceAll(from, to);
  });
  return vm.runInNewContext(
    '(function(flow,node,msg,Buffer,Promise,glob){' + source + '\n})',
    {}
  );
}

const globalData = {};
const flowData = {};
const glob = {
  get: (key) => globalData[key],
  set: (key, value) => {
    globalData[key] = value;
  }
};
const flow = {
  get: (key) => key === 'cfg' ? { dryRun: true } : flowData[key],
  set: (key, value) => {
    flowData[key] = value;
  }
};
const node = { status: () => {}, error: (message) => {
  throw new Error(message);
} };
const mapLog = vmFunction('u2-log-to-status.js', {
  __FLOW__: 'sih-hull',
  __SITE__: 'Hull',
  __KIND__: 'day'
});

function applyNote(action, message) {
  let source = code('u1-note-status.js');
  source = source.replaceAll('__FLOW__', 'sih-hull');
  source = source.replaceAll('__SITE__', 'Hull');
  source = source.replaceAll('__STEP__', 'ASSET KPIs');
  source = source.replaceAll('__ACTION__', action);
  const fn = vm.runInNewContext(
    '(function(flow,node,msg,Buffer,Promise,glob){' + source + '\n})',
    {}
  );
  return fn(flow, node, message, Buffer, Promise, glob);
}

const initial = {
  day,
  payload: day,
  runId: 'test-run',
  startedAt: new Date().toISOString(),
  mode: 'backfill'
};
check(
  applyNote('queue', initial) === initial,
  'status function runs in a VM and passes the message unchanged'
);
applyNote('running', initial);
applyNote('asset-done', { ...initial, parts: { count: 2 } });
applyNote('part-done', {
  ...initial,
  parts: { count: 24 }
});
{
  // A new run turns the open days of a dead older run into interrupted.
  const old = new Date(Date.now() - 3600000).toISOString();
  globalData['runStatus_sih-hull'].days['2026-08-01'] = {
    state: 'running', stepAt: old
  };
  globalData['runStatus_sih-hull'].days['2026-08-02'] = {
    state: 'running', stepAt: new Date().toISOString()
  };
  applyNote('queue', { ...initial, runId: 'next-run', day: '2026-08-03',
    payload: '2026-08-03' });
  const days = globalData['runStatus_sih-hull'].days;
  check(
    days['2026-08-01'].state === 'interrupted' &&
      days['2026-08-02'].state === 'running',
    'a new run interrupts dead open days and keeps recent ones'
  );
  delete days['2026-08-01'];
  delete days['2026-08-02'];
  delete days['2026-08-03'];
}
{
  // A late checkpoint of another asset does not reopen a finished day.
  const late = '2026-08-09';
  globalData['runStatus_sih-hull'].days[late] = {
    state: 'dry_run', step: 'JOIN & BUILD TABLES', stepAt: '2026-10-22T00:00:00Z'
  };
  const note = (step) => {
    let src = code('u1-note-status.js');
    src = src.replaceAll('__FLOW__', 'sih-hull').replaceAll('__SITE__', 'Hull');
    src = src.replaceAll('__STEP__', step).replaceAll('__ACTION__', 'running');
    vm.runInNewContext('(function(flow,node,msg,Buffer,Promise,glob){' + src + '\n})', {})(
      flow, node, { day: late, payload: late }, Buffer, Promise, glob);
  };
  note('ASSET STOPS');
  check(globalData['runStatus_sih-hull'].days[late].state === 'dry_run',
    'a late ASSET STOPS checkpoint keeps a finished day finished');
  note('DAY SETUP');
  check(globalData['runStatus_sih-hull'].days[late].state === 'running',
    'DAY SETUP restarts a finished day');
  globalData['runStatus_sih-hull'].state = 'quiet';
  globalData['runStatus_sih-hull'].days[late].state = 'dry_run';
  note('ASSET STOPS');
  check(globalData['runStatus_sih-hull'].state === 'quiet',
    'a late checkpoint of a finished day does not turn the flow to running');
  delete globalData['runStatus_sih-hull'].days[late];
}
const logMessage = {
  line: `${day} [backfill] DRY RUN: one table`,
  payload: {
    production_day: day,
    message: 'DRY RUN: one table'
  }
};
mapLog(flow, node, logMessage, Buffer, Promise, glob);
let current = globalData['runStatus_sih-hull'];
const currentDay = current && current.days[day];
check(
  currentDay && currentDay.state === 'dry_run',
  'queued and running day reaches dry_run from a formatted log line'
);
check(
  currentDay && currentDay.assetsDone === 1 &&
    currentDay.assetsTotal === 2 &&
    currentDay.partsDone === 1 &&
    currentDay.partsTotal === 24,
  'asset and hourly-part checkpoints update counts'
);
check(
  mapLog(flow, node, logMessage, Buffer, Promise, glob) === logMessage,
  'status log node passes the original message through'
);

for (const [line, state] of [
  ['WRITING rpt_window 2 rows', 'written'],
  ['FAILED, NOTHING WRITTEN: KPI failed', 'failed'],
  ['NOTHING TO WRITE: empty day', 'nothing']
]) {
  applyNote('running', initial);
  const message = {
    line: `${day} [backfill] ${line}`,
    payload: { production_day: day, message: line }
  };
  mapLog(flow, node, message, Buffer, Promise, glob);
  current = globalData['runStatus_sih-hull'];
  check(current.days[day].state === state, `log outcome maps to ${state}`);
  if (state === 'failed') {
    check(
      current.days[day].detail === 'KPI failed',
      'failed status retains the short failure detail'
    );
  }
}

const staleStatus = {
  flow: 'sih-hull',
  site: 'Hull',
  dryRun: true,
  runId: 'old',
  mode: 'backfill',
  startedAt: '2026-01-01T00:00:00.000Z',
  lastBeatAt: '2026-01-01T00:00:00.000Z',
  days: {}
};
for (let i = 1; i <= 102; i++) {
  const key = `2025-01-${String((i % 28) + 1).padStart(2, '0')}`;
  staleStatus.days[key + '-' + i] = {
    state: 'written',
    step: 'complete',
    stepAt: '2026-01-01T00:00:00.000Z',
    detail: 'old'
  };
}
globalData['runStatus_sih-hull'] = staleStatus;
applyNote('queue', initial);
current = globalData['runStatus_sih-hull'];
check(Object.keys(current.days).length <= 100, 'status pruning caps days at 100');
check(
  JSON.stringify(current).length < 2 * 1024 * 1024,
  'pruned status remains below the 2 MB VFC context limit'
);

const route = vmFunction('v1-route.js', {});
for (const [view, output] of [
  ['', 0],
  ['status', 1],
  ['history', 2]
]) {
  const request = {
    req: {
      query: view ? { view } : {}
    }
  };
  const routed = route(flow, node, request, Buffer, Promise, glob);
  check(routed[output] === request, `monitor route selects ${view || 'page'}`);
}
const unknownRoute = {
  req: {
    query: {
      view: 'unknown'
    }
  }
};
const unknownResult = route(
  flow,
  node,
  unknownRoute,
  Buffer,
  Promise,
  glob
);
check(
  unknownResult[3] === unknownRoute && unknownRoute.statusCode === 404,
  'unknown monitor route returns 404 JSON'
);

const statusFn = vmFunction('v2-status-json.js', {});
const staleAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
globalData['runStatus_sih-hull'] = {
  flow: 'sih-hull',
  startedAt: staleAt,
  lastBeatAt: staleAt,
  days: {
    [day]: {
      state: 'running',
      step: 'ASSET KPIs'
    }
  }
};
const statusMessage = {};
statusFn(flow, node, statusMessage, Buffer, Promise, glob);
check(
  statusMessage.statusCode === 200 &&
    statusMessage.payload.flows['sih-hull'].state === 'STUCK' &&
    statusMessage.payload.flows['sih-hull'].days[day].state === 'STUCK',
  'status JSON marks an inactive running day as STUCK'
);
check(
  globalData['runStatus_sih-hull'].days[day].state === 'running',
  'STUCK is derived without mutating global status'
);
globalData['runStatus_sih-hull'].lastBeatAt = new Date().toISOString();
statusFn(flow, node, statusMessage, Buffer, Promise, glob);
check(
  statusMessage.payload.flows['sih-hull'].state === 'running' &&
    statusMessage.payload.flows['sih-hull'].stuck === false,
  'recent status remains running and is not STUCK'
);
globalData.cfg = {
  platform: 'legacy',
  sites: [
    {
      name: 'Hull'
    }
  ],
  clientSecret: 'not returned'
};
statusFn(flow, node, statusMessage, Buffer, Promise, glob);
check(
  statusMessage.payload.flows.config.state === 'ready' &&
    statusMessage.payload.flows.config.sites === 1 &&
    !('clientSecret' in statusMessage.payload.flows.config),
  'Config status is derived without exposing credentials'
);

const historyRequest = vmFunction('v3-history-request.js', {});
globalData.cfg = {
  root: 'eu_report'
};
const goodHistory = {
  req: {
    query: {
      flow: 'sih-hull',
      month: '2026-10'
    }
  }
};
const goodHistoryResult = historyRequest(
  flow,
  node,
  goodHistory,
  Buffer,
  Promise,
  glob
);
check(
  goodHistoryResult[0] === goodHistory &&
    goodHistory.path === 'eu_report/logs/sih-hull/',
  'valid history request lists only the selected flow folder'
);
for (const query of [
  { flow: 'other', month: '2026-10' },
  { flow: 'sih-hull', month: '2026-13' }
]) {
  const invalid = {
    req: {
      query
    }
  };
  const result = historyRequest(flow, node, invalid, Buffer, Promise, glob);
  check(
    result[1] === invalid && invalid.statusCode === 400,
    'invalid history flow or month returns 400'
  );
}
globalData.cfg = undefined;
const noConfig = {
  req: {
    query: {
      flow: 'sih-hull',
      month: '2026-10'
    }
  }
};
historyRequest(flow, node, noConfig, Buffer, Promise, glob);
check(
  noConfig.statusCode === 503,
  'history request reports missing Config as 503'
);
globalData.cfg = {
  root: 'eu_report'
};

const pickHistory = vmFunction('v4-pick-history.js', {});
const historyList = {
  payload: [
    {
      key: 'eu_report/logs/sih-hull/log_2026-10.csv'
    }
  ],
  historyName: 'log_2026-10.csv',
  historyFlow: 'sih-hull',
  historyMonth: '2026-10'
};
const picked = pickHistory(flow, node, historyList, Buffer, Promise, glob);
check(
  picked[0] === historyList &&
    historyList.path === 'eu_report/logs/sih-hull/log_2026-10.csv',
  'history list chooses the exact requested month file'
);
// The VFC list objects node gives keys with data/ten=<tenant>/.
const tenantList = {
  payload: [
    {
      key: 'data/ten=reckitt/eu_report/logs/sih-hull/log_2026-10.csv'
    }
  ],
  historyName: 'log_2026-10.csv',
  historyFlow: 'sih-hull',
  historyMonth: '2026-10'
};
pickHistory(flow, node, tenantList, Buffer, Promise, glob);
check(
  tenantList.path === 'eu_report/logs/sih-hull/log_2026-10.csv',
  'history read path has no data/ten=<tenant>/ prefix (VFC list keys)'
);
const missingHistory = {
  payload: [],
  historyName: 'log_2026-10.csv',
  historyFlow: 'sih-hull',
  historyMonth: '2026-10'
};
const missingResult = pickHistory(
  flow,
  node,
  missingHistory,
  Buffer,
  Promise,
  glob
);
check(
  missingResult[1] === missingHistory &&
    missingHistory.statusCode === 404,
  'missing monthly history returns 404 before read-object'
);

const historyRows = [
  '"ts_utc","seq","flow","site","production_day","mode","level",' +
    '"source","message"'
];
for (let i = 1; i <= 205; i++) {
  const message = i === 205 ? 'line, with "quote"' : `line ${i}`;
  const escaped = message.replace(/"/g, '""');
  historyRows.push(
    `"2026-10-01T00:00:00.000Z","${i}","sih-hull","Hull",` +
    `"2026-10-01","backfill","info","flow","${escaped}"`
  );
}
const historyJson = vmFunction('v5-history-json.js', {});
const historyMessage = {
  payload: historyRows.join('\r\n'),
  historyFlow: 'sih-hull',
  historyMonth: '2026-10'
};
historyJson(flow, node, historyMessage, Buffer, Promise, glob);
// The VFC read object node gives a Buffer, also serialised.
for (const [kind, payload] of [
  ['Buffer', Buffer.from(historyRows.join('\n'), 'utf8')],
  ['serialised Buffer', Buffer.from(historyRows.join('\n'), 'utf8').toJSON()]
]) {
  const m = { payload, historyFlow: 'sih-hull', historyMonth: '2026-10' };
  historyJson(flow, node, m, Buffer, Promise, glob);
  check(m.statusCode === 200 && m.payload.count === 205,
    `history JSON reads a ${kind} from the read node`);
}
check(
  historyMessage.statusCode === 200 &&
    historyMessage.payload.count === 205 &&
    historyMessage.payload.rows.length === 200 &&
    historyMessage.payload.truncated === 5,
  'history JSON caps output to the newest 200 parsed rows'
);
check(
  historyMessage.payload.rows[199].message === 'line, with "quote"',
  'history CSV parser preserves quoted commas and quotes'
);

const pageMessage = {};
vmFunction('v6-monitor-page.js', {})(
  flow,
  node,
  pageMessage,
  Buffer,
  Promise,
  glob
);
check(
  pageMessage.statusCode === 200 &&
    pageMessage.headers['content-type'].indexOf('text/html') === 0 &&
    pageMessage.payload.indexOf("base + '?view='") !== -1 &&
    pageMessage.payload.indexOf("url('status')") !== -1 &&
    pageMessage.payload.indexOf("url('history', params)") !== -1 &&
    pageMessage.payload.indexOf("'/status'") === -1 &&
    pageMessage.payload.indexOf("'/history'") === -1 &&
    pageMessage.payload.indexOf('/command?key=') !== -1,
  'monitor page uses query views for GETs and a separate command route'
);

// The command form of the page: a visible key field, a pasted URL gives its
// key, and an answer that is not JSON (the VFC refusing a key) is shown.
{
  const script = /<script>([\s\S]*)<\/script>/.exec(pageMessage.payload)[1];
  const els = {};
  const el = (id) => (els[id] = els[id] || {
    value: '', textContent: '', hidden: false, checked: false,
    addEventListener(type, fn) { this['on' + type] = fn; }
  });
  const sent = [];
  vm.runInNewContext(script, {
    location: { search: '?key=PAGEKEY', pathname: '/public/t/reports-monitor' },
    URLSearchParams, JSON, Date, Object, encodeURIComponent,
    document: { getElementById: el },
    setInterval: () => {},
    fetch: (url) => {
      sent.push(url);
      const refused = /BADKEY/.test(url);
      return Promise.resolve({
        ok: !refused, status: refused ? 401 : 202,
        text: () => Promise.resolve(refused ? 'Unauthorized' : '{"accepted":true}')
      });
    }
  });
  const post = async (key) => {
    el('commandFlow').value = 'sih-hull';
    el('commandKey').value = key;
    el('commandError').textContent = '';
    el('commandResult').textContent = '';
    await el('commandForm').onsubmit({ preventDefault() {} });
    await new Promise((resolve) => setTimeout(resolve, 10));
  };
  check(pageMessage.payload.indexOf('id="commandKey" type="text"') !== -1,
    'command key field is visible text, not a password field');
  await post('KEY123');
  check(sent[sent.length - 1].endsWith('/command?key=KEY123') &&
    el('commandResult').textContent.indexOf('accepted') !== -1,
    'command form sends the typed key');
  await post('https://h/public/t/reports-monitor/command?key=KEY456&x=1');
  check(sent[sent.length - 1].endsWith('/command?key=KEY456'),
    'a pasted URL gives its key');
  await post('BADKEY');
  check(el('commandError').textContent === 'Command failed: HTTP 401 Unauthorized',
    'a refusal that is not JSON shows its HTTP status and text');
  await post('');
  check(/Command key missing/.test(el('commandError').textContent),
    'no key typed and none set: the page says so');
  check(el('keyRow').hidden === false, 'no COMMAND_KEY: the key field is shown');
}

// COMMAND_KEY set once in the page node: the field is hidden and used.
{
  const key = 'SET<KEY>1';
  const make = vmFunction('v6-monitor-page.js', {
    "var COMMAND_KEY = '';": "var COMMAND_KEY = '" + key + "';"
  });
  const page = {};
  make(flow, node, page, Buffer, Promise, glob);
  check(page.payload.indexOf(key) === -1 &&
    page.payload.indexOf('SET\\u003cKEY>1') !== -1,
    'COMMAND_KEY goes into the page escaped (no markup)');
  const script = /<script>([\s\S]*)<\/script>/.exec(page.payload)[1];
  const els = {};
  const el = (id) => (els[id] = els[id] || {
    value: '', textContent: '', hidden: false, checked: false,
    addEventListener(type, fn) { this['on' + type] = fn; }
  });
  const sent = [];
  vm.runInNewContext(script, {
    location: { search: '?key=PAGEKEY', pathname: '/public/t/reports-monitor' },
    URLSearchParams, JSON, Date, Object, encodeURIComponent,
    document: { getElementById: el },
    setInterval: () => {},
    fetch: (url) => {
      sent.push(url);
      return Promise.resolve({ ok: true, status: 202, text: () => Promise.resolve('{"accepted":true}') });
    }
  });
  el('commandFlow').value = 'sih-hull';
  await el('commandForm').onsubmit({ preventDefault() {} });
  await new Promise((resolve) => setTimeout(resolve, 10));
  check(el('keyRow').hidden === true, 'COMMAND_KEY set: the key field is hidden');
  check(sent[sent.length - 1].endsWith('/command?key=' + encodeURIComponent(key)),
    'COMMAND_KEY set: the command is sent with it, nothing to type');
}

const listenerData = {};
const listenerFlow = {
  get: (key) => listenerData[key],
  set: (key, value) => {
    listenerData[key] = value;
  }
};
globalData.jobQueue = [];
const collect = vmFunction('w2-collect.js', {});
collect(
  listenerFlow,
  node,
  {
    event: {
      kind: 'source',
      type: 'plan_opt',
      site: 'Hull',
      month: '2026-09'
    }
  },
  Buffer,
  Promise,
  glob
);
check(
  globalData['runStatus_pbi-listener'].state === 'listening' &&
    globalData['runStatus_pbi-listener'].pendingEntries === 1,
  'listener status records pending file events'
);
listenerData.pending = {
  'source|Hull|2026-09': {
    kind: 'source',
    site: 'Hull',
    month: '2026-09',
    type: 'plan_opt',
    types: {
      plan_opt: true
    },
    first: Date.now() - 121000,
    events: 1
  }
};
const release = vmFunction('w3-release.js', {});
release(listenerFlow, node, {}, Buffer, Promise, glob);
check(
  globalData['runStatus_pbi-listener'].queuedJobs === 1 &&
    globalData['runStatus_pbi-listener'].lastQueuedJob.from === '2026-09',
  'listener status records released job count and range'
);
const takeJob = vmFunction('w6-take-job.js', {});
takeJob(listenerFlow, node, {}, Buffer, Promise, glob);
check(
  globalData['runStatus_pbi-listener'].queuedJobs === 0,
  'listener status updates when a queued job is taken'
);

globalData['runStatus_pbi-report'] = {
  state: 'running'
};
const notePbiLog = vmFunction('w4-note-log.js', {});
notePbiLog(
  flow,
  node,
  {
    line: 'sample log line',
    payload: {
      level: 'failed',
      message: 'sample failure'
    }
  },
  Buffer,
  Promise,
  glob
);
check(
  globalData['runStatus_pbi-report'].state === 'failed' &&
    globalData['runStatus_pbi-report'].lastLog === 'sample failure',
  'PBI log checkpoint records failure without retaining full rows'
);
globalData['lastLog'] = Date.now() - 31000;
globalData.done = false;
const checkQuiet = vmFunction('w5-check-quiet.js', {});
checkQuiet(flow, node, {}, Buffer, Promise, glob);
check(
  globalData['runStatus_pbi-report'].state === 'failed' &&
    globalData['runStatus_pbi-report'].finishedAt,
  'quiet listener checkpoint preserves a PBI failure outcome'
);

const commandRaw = vmFunction('v10-command.js', {});
// Each call is a separate click, so the duplicate guard starts empty.
const command = (...args) => {
  delete globalData.lastCommand;
  return commandRaw(...args);
};
globalData.cfg = {
  root: 'eu_report',
  sites: [
    {
      name: 'Hull'
    }
  ]
};
globalData['runStatus_sih-hull'] = undefined;
globalData['runStatus_rpt-hull'] = undefined;
globalData['runStatus_pbi-report'] = undefined;
globalData.jobQueue = [];
globalData.runMonitorCommands = [];
const dailyBody = {
  flow: 'sih-hull',
  start: '2026-09-01',
  end: '2026-10-01',
  force: false
};
const dailyMessage = {
  payload: dailyBody
};
const dailyResult = command(
  flow,
  node,
  dailyMessage,
  Buffer,
  Promise,
  glob
);
check(
  dailyResult[0].statusCode === 202 &&
    dailyResult[1].payload.start === dailyBody.start &&
    dailyResult[1].payload.end === dailyBody.end &&
    dailyResult[2] === null,
  '31-day SIH command sends the exact daily settings payload'
);
check(
  globalData['runStatus_sih-hull'].state === 'queued' &&
    dailyResult[4].payload.indexOf('[command] ACCEPTED') !== -1 &&
    globalData.runMonitorCommands[0].result === 'accepted',
  'accepted command reserves status and emits an audit log'
);
// The VFC http in node can give the POST body in other forms than an object.
for (const [kind, build] of [
  ['JSON text', (b) => ({ payload: JSON.stringify(b) })],
  ['a Buffer', (b) => ({ payload: Buffer.from(JSON.stringify(b)) })],
  ['a serialised Buffer', (b) => ({ payload: Buffer.from(JSON.stringify(b)).toJSON() })],
  ['msg.req.body', (b) => ({ payload: undefined, req: { body: b } })]
]) {
  globalData['runStatus_sih-hull'] = undefined;
  globalData.runMonitorCommands = [];
  const forms = command(flow, node, build({
    flow: 'sih-hull', start: '2026-09-05', end: '2026-09-05'
  }), Buffer, Promise, glob);
  check(forms[0].statusCode === 202 && forms[1].payload.start === '2026-09-05',
    `command body as ${kind} is accepted`);
}
const noBody = command(flow, node, { payload: undefined }, Buffer, Promise, glob);
check(noBody[0].statusCode === 400 &&
  /got nothing, req.body nothing/.test(noBody[0].payload.error),
  'a missing body says what the node received');
globalData['runStatus_sih-hull'] = {
  flow: 'sih-hull', state: 'queued', startedAt: dailyBody.start,
  lastBeatAt: new Date().toISOString(), days: {}
};
globalData.runMonitorCommands = [];
const busyDaily = command(flow, node, {
  payload: {
    ...dailyBody,
    end: '2026-09-30'
  }
}, Buffer, Promise, glob);
check(
  busyDaily[0].statusCode === 409 &&
    busyDaily[1] === null,
  'busy daily flow refuses a second command without force'
);
{
  // The same POST twice within 5 seconds runs once; the 2nd gets the 1st answer.
  globalData['runStatus_sih-hull'] = undefined;
  globalData.runMonitorCommands = [];
  delete globalData.lastCommand;
  const body = { flow: 'sih-hull', start: '2026-09-01', end: '2026-09-02' };
  const first = commandRaw(flow, node, { payload: body }, Buffer, Promise, glob);
  const second = commandRaw(flow, node, { payload: body }, Buffer, Promise, glob);
  check(
    first[0].statusCode === 202 && first[1] !== null &&
      second[0].statusCode === 202 && second[1] === null &&
      second[4] === null && globalData.runMonitorCommands.length === 1,
    'a duplicate POST within 5 s is answered again but not run twice'
  );
}
// A dead run (no checkpoint for 30 minutes) is not busy and can be cleared.
{
  const old = new Date(Date.now() - 3600000).toISOString();
  const fresh = new Date().toISOString();
  globalData['runStatus_sih-hull'] = {
    flow: 'sih-hull', state: 'running', startedAt: old, lastBeatAt: old,
    days: {
      '2026-09-09': { state: 'running', stepAt: old },
      '2026-09-10': { state: 'dry_run', stepAt: old }
    }
  };
  globalData['runStatus_rpt-hull'] = {
    flow: 'rpt-hull', state: 'running', startedAt: fresh, lastBeatAt: fresh,
    days: { '2026-10-21': { state: 'running', stepAt: fresh } }
  };
  globalData.runMonitorCommands = [];
  const cleared = command(flow, node, {
    payload: { action: 'clear-stuck' }
  }, Buffer, Promise, glob);
  const sih = globalData['runStatus_sih-hull'];
  check(
    cleared[0].statusCode === 200 && cleared[0].payload.cleared === 2 &&
      sih.days['2026-09-09'].state === 'interrupted' &&
      sih.days['2026-09-10'].state === 'dry_run' &&
      sih.state === 'idle',
    'clear-stuck interrupts the open days of a dead run only'
  );
  check(
    globalData['runStatus_rpt-hull'].days['2026-10-21'].state === 'running',
    'clear-stuck leaves a run with a recent checkpoint alone'
  );
  globalData['runStatus_sih-hull'] = {
    flow: 'sih-hull', state: 'running', startedAt: old, lastBeatAt: old,
    days: { '2026-09-09': { state: 'running', stepAt: old } }
  };
  const idle = command(flow, node, {
    payload: { ...dailyBody, end: '2026-09-30' }
  }, Buffer, Promise, glob);
  check(idle[0].statusCode === 202,
    'a dead run does not block a new command');
}
const forcedDaily = command(flow, node, {
  payload: {
    ...dailyBody,
    end: '2026-09-30',
    force: true
  }
}, Buffer, Promise, glob);
check(
  forcedDaily[0].statusCode === 202 &&
    forcedDaily[0].payload.forced === true &&
    forcedDaily[1].payload.start === dailyBody.start,
  'force explicitly overrides a busy daily flow'
);
for (const body of [
  {
    flow: 'sih-hull',
    start: '2026-02-30',
    end: '2026-03-01'
  },
  {
    flow: 'sih-hull',
    start: '2026-09-01',
    end: '2026-10-02'
  },
  {
    flow: 'sih-hull',
    start: '2026-09-02',
    end: '2026-09-01'
  },
  {
    flow: 'unknown',
    start: '2026-09-01',
    end: '2026-09-02'
  },
  {
    flow: 'sih-hull',
    start: '2026-09-01',
    end: '2026-09-02',
    force: 'true'
  }
]) {
  const refused = command(flow, node, {
    payload: body
  }, Buffer, Promise, glob);
  check(
    refused[0].statusCode === 400 &&
      refused[1] === null &&
      refused[2] === null &&
      refused[3] === null,
    'invalid command is rejected before a BACKFILL output'
  );
}
globalData['runStatus_rpt-hull'] = undefined;
const shiftResult = command(flow, node, {
  payload: {
    flow: 'rpt-hull',
    start: '2026-09-01',
    end: '2026-09-02'
  }
}, Buffer, Promise, glob);
check(
  shiftResult[0].statusCode === 202 &&
    shiftResult[2].payload.start === '2026-09-01' &&
    shiftResult[2].payload.end === '2026-09-02',
  'shift command routes the exact date payload to its BACKFILL output'
);
globalData['runStatus_pbi-report'] = undefined;
const pbiBody = {
  flow: 'pbi-report',
  from: '2025-11',
  to: '2026-10',
  tables: ['Plan_OPT_EU'],
  sites: ['Hull'],
  force: false
};
const pbiResult = command(flow, node, {
  payload: pbiBody
}, Buffer, Promise, glob);
check(
  pbiResult[0].statusCode === 202 &&
    JSON.stringify(pbiResult[3].payload) === JSON.stringify({
      from: '2025-11',
      to: '2026-10',
      tables: ['Plan_OPT_EU'],
      sites: ['Hull']
    }),
  '12-month PBI command sends the exact task-settings payload'
);
for (const body of [
  {
    flow: 'pbi-report',
    from: '2025-10',
    to: '2026-10'
  },
  {
    flow: 'pbi-report',
    from: '2026-10',
    to: '2026-09'
  },
  {
    flow: 'pbi-report',
    from: '2026-13',
    to: '2026-13'
  },
  {
    flow: 'pbi-report',
    from: '2026-09',
    to: '2026-10',
    tables: ['not-a-table']
  },
  {
    flow: 'pbi-report',
    from: '2026-09',
    to: '2026-10',
    sites: ['not-a-site']
  }
]) {
  const refused = command(flow, node, {
    payload: body
  }, Buffer, Promise, glob);
  check(
    refused[0].statusCode === 400 && refused[3] === null,
    'invalid PBI month, table or site is rejected before backfill'
  );
}
globalData.jobQueue = [
  {
    tables: ['Plan_OPT_EU']
  }
];
const busyPbi = command(flow, node, {
  payload: {
    ...pbiBody
  }
}, Buffer, Promise, glob);
check(
  busyPbi[0].statusCode === 409,
  'queued listener job makes the PBI build busy'
);
const forcedPbi = command(flow, node, {
  payload: {
    ...pbiBody,
    force: true
  }
}, Buffer, Promise, glob);
check(
  forcedPbi[0].statusCode === 202 &&
    forcedPbi[0].payload.forced === true,
  'force explicitly overrides a queued PBI listener job'
);
globalData.cfg = undefined;
const noCommandConfig = command(flow, node, {
  payload: {
    flow: 'rpt-hull',
    start: '2026-09-01',
    end: '2026-09-02'
  }
}, Buffer, Promise, glob);
check(
  noCommandConfig[0].statusCode === 503,
  'command reports missing Config as 503'
);

const monitorFlow = read('vfc-run-monitor.json');
const unconnected = monitorFlow.filter((item) =>
  item.type === 'link out' &&
  [
    'to sih-hull BACKFILL',
    'to rpt-hull BACKFILL',
    'to pbi-report BACKFILL'
  ].includes(item.name)
);
check(
  unconnected.length === 3 &&
    unconnected.every((item) => item.links.length === 0),
  'monitor exports the three intentionally unconnected BACKFILL links'
);
const postNode = monitorFlow.find((item) =>
  item.type === 'http in' &&
  item.endpoint === '/reports-monitor/command'
);
check(
  postNode && postNode.method === 'post' && postNode.access === 'key',
  'command endpoint requires the VFC access key'
);
const getNode = monitorFlow.find((item) =>
  item.type === 'http in' &&
  item.name === 'Get report monitor'
);
check(
  getNode && getNode.endpoint === '/reports-monitor' &&
    getNode.method === 'get',
  'monitor GET endpoint has no trailing slash (the VFC key link refuses it)'
);
for (const [file, name, targetName] of [
  ['vfc-pbi-daily-hull.json', 'sih-hull BACKFILL', 'SITE SETTINGS'],
  ['vfc-rpt-hull.json', 'rpt-hull BACKFILL', 'SITE SETTINGS'],
  ['vfc-pbi-report.json', 'pbi-report BACKFILL', 'TASK SETTINGS']
]) {
  const targetFlow = read(file);
  const backfill = targetFlow.find((item) =>
    item.type === 'link in' && item.name === name
  );
  const settings = targetFlow.find((item) =>
    item.type === 'function' && item.name.indexOf(targetName) !== -1
  );
  check(
    backfill && backfill.links.length === 0 && settings &&
      backfill.wires[0][0] === settings.id,
    `${name} feeds the existing settings node and awaits manual wiring`
  );
  check(
    validateFlow(targetFlow).errors.length === 0,
    `${file} validates with its intentionally unconnected BACKFILL input`
  );
}
const statusAfterCommand = {};
globalData.cfg = {
  platform: 'legacy',
  sites: [
    {
      name: 'Hull'
    }
  ]
};
statusFn(flow, node, statusAfterCommand, Buffer, Promise, glob);
check(
  statusAfterCommand.payload.commands.length <= 50 &&
    statusAfterCommand.payload.commands.some((entry) =>
      entry.result === 'accepted' && entry.flow === 'pbi-report'
    ),
  'status JSON exposes the bounded command audit history'
);
globalData.runMonitorCommands = Array.from({ length: 55 }, (_, index) => ({
  detail: index
}));
const auditCap = command(flow, node, {
  payload: {
    flow: 'unknown'
  }
}, Buffer, Promise, glob);
check(
  auditCap[0].statusCode === 400 &&
    globalData.runMonitorCommands.length === 50 &&
    globalData.runMonitorCommands[0].detail === 6,
  'command audit retains only the newest 50 entries'
);

function mask(value) {
  return JSON.stringify(value)
    .replace(/"loaded_at":\d+/g, '"loaded_at":0')
    .replace(/"ts_utc":"[^"]+"/g, '"ts_utc":"MASKED"');
}

const flows = [
  ['vfc-pbi-daily-hull.json', 'daily'],
  ['vfc-rpt-hull.json', 'shift']
];
const scenarios = [
  'ok',
  'products',
  'kpi-413-day',
  'value-413-day',
  'kpi-413',
  'machines'
];

for (const [file, kind] of flows) {
  const currentFlow = read(file);
  const oldFlow = readBaseline(file);
  for (const scenario of scenarios) {
    const options = {
      startDay: day,
      write: true,
      configNodes: config,
      lake: lake(),
      platform,
      fetchImpl: makeMockFetch(scenario),
      clientId: 'x',
      clientSecret: 'y',
      allAssets: true
    };
    const before = await runFlow(oldFlow, {
      ...options,
      fetchImpl: makeMockFetch(scenario)
    });
    const after = await runFlow(currentFlow, {
      ...options,
      fetchImpl: makeMockFetch(scenario)
    });
    check(
      mask(before.requests) === mask(after.requests),
      `${kind}/${scenario}: API requests unchanged`
    );
    check(
      mask(before.parquetPayloads) === mask(after.parquetPayloads),
      `${kind}/${scenario}: parquet rows unchanged`
    );
    check(
      mask(before.written) === mask(after.written),
      `${kind}/${scenario}: output paths unchanged`
    );
    check(
      mask(before.logs) === mask(after.logs),
      `${kind}/${scenario}: log lines unchanged`
    );
    if (scenario === 'ok' || scenario === 'products') {
      const flowName = kind === 'daily' ? 'sih-hull' : 'rpt-hull';
      const live = after.globalContext['runStatus_' + flowName];
      check(
        live && live.days[day] &&
          ['written', 'dry_run'].includes(live.days[day].state),
        `${kind}/${scenario}: mock run writes final live status`
      );
    }
  }
}

const pbiFile = 'vfc-pbi-report.json';
const oldPbiFlow = readBaseline(pbiFile);
const newPbiFlow = read(pbiFile);
const pbiOptions = {
  startDay: day,
  startPayload: {
    tables: [],
    sites: [],
    from: '2026-09',
    to: '2026-09'
  },
  write: true,
  configNodes: config,
  platform,
  lake: new Map(),
  clientId: 'x',
  clientSecret: 'y',
  fetchImpl: async () => {
    throw new Error('PBI report build must not call Insights Hub');
  }
};
const oldPbiResult = await runFlow(oldPbiFlow, pbiOptions);
const newPbiResult = await runFlow(newPbiFlow, pbiOptions);
for (const field of [
  'requests',
  'parquetPayloads',
  'written',
  'logs',
  'errors'
]) {
  check(
    mask(oldPbiResult[field]) === mask(newPbiResult[field]),
    `PBI build/${field}: behavior unchanged`
  );
}
check(
  newPbiResult.globalContext['runStatus_pbi-report'] &&
    newPbiResult.globalContext['runStatus_pbi-report'].state === 'running',
  'PBI build records a compact live job status'
);
// The flow list: every listed flow is wired in the built flows, and a flow
// without checkpoints or BACKFILL link in is reported.
const builtFlows = [
  'vfc-pbi-daily-hull.json',
  'vfc-rpt-hull.json',
  'vfc-pbi-report.json',
  'vfc-pbi-listener.json'
].flatMap((file) => read(file));
check(checkMonitorFlows(builtFlows).length === 0,
  'monitor list: every listed flow writes its status and has its BACKFILL');
const withoutShift = builtFlows.filter((n) => n.name !== 'rpt-hull BACKFILL' &&
  !(n.func || '').includes("var FLOW_NAME = 'rpt-hull';"));
const missing = checkMonitorFlows(withoutShift);
check(missing.length === 2 && missing.every((e) => e.includes('rpt-hull')),
  'monitor list: a flow without checkpoints and BACKFILL fails twice');
const backfillLinks = monitorFlow.filter((n) => n.type === 'link out' &&
  / BACKFILL$/.test(n.name)).map((n) => n.name);
check(JSON.stringify(backfillLinks) === JSON.stringify(MONITOR_FLOWS
  .filter((f) => f.backfill).map((f) => `to ${f.id} BACKFILL`)),
  'monitor list: one BACKFILL link out per backfill flow, in list order');

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('ALL PASS');
}
