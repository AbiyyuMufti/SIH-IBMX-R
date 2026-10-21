// Tests live run-status checkpoints and unchanged report behavior.
// In: mock Insights Hub responses and the selected platform.
// Out: a failure exit code if any status or behavior assertion fails.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { runFlow, testPlatform } from './lib-vfc-runner.js';
import { makeMockFetch } from './lib-mock-ih.js';
import { code } from './lib-flow-builder.js';

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
const glob = {
  get: (key) => globalData[key],
  set: (key, value) => {
    globalData[key] = value;
  }
};
const flow = { get: (key) => key === 'cfg' ? { dryRun: true } : undefined };
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

const route = vmFunction('m1-route.js', {});
for (const [view, output] of [
  ['', 0],
  ['status', 1],
  ['history', 2]
]) {
  const request = {
    req: {
      params: view ? { view } : {}
    }
  };
  const routed = route(flow, node, request, Buffer, Promise, glob);
  check(routed[output] === request, `monitor route selects ${view || 'page'}`);
}
const unknownRoute = {
  req: {
    params: {
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

const statusFn = vmFunction('m2-status-json.js', {});
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

const historyRequest = vmFunction('m3-history-request.js', {});
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

const pickHistory = vmFunction('m4-pick-history.js', {});
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
const historyJson = vmFunction('m5-history-json.js', {});
const historyMessage = {
  payload: historyRows.join('\r\n'),
  historyFlow: 'sih-hull',
  historyMonth: '2026-10'
};
historyJson(flow, node, historyMessage, Buffer, Promise, glob);
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
vmFunction('m6-monitor-page.js', {})(
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
    pageMessage.payload.indexOf('url("status")') !== -1 &&
    pageMessage.payload.indexOf('url("history",params)') !== -1,
  'monitor page includes polling and history endpoints'
);

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
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('ALL PASS');
}
