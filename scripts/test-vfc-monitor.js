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

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('ALL PASS');
}
