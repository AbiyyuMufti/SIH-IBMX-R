// Offline test of the tab Provideam fetch (flows/vfc-provideam-fetch.json):
// runs the flow with the Config tab against a fake Provideam API and an
// in-memory data lake, on made-up rows (no customer data).
// Usage: node scripts/test-vfc-provideam-fetch.js
import { readFileSync } from 'node:fs';
import { runFlow } from './lib-vfc-runner.js';

const read = (f) => JSON.parse(readFileSync(new URL('../flows/' + f, import.meta.url), 'utf8'));
let failures = 0;
const check = (ok, text) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`);
  if (!ok) failures++;
};

const KEY = 'test-provideam-key';
const config = read('vfc-config.json').map((n) => n.type === 'function' ?
  { ...n, func: n.func.replace('PUT_PROVIDEAM_API_KEY_HERE', KEY) } : n);
const TYPES = ['plan_opt', 'run_rates', 'line_losses', 'volume_loss_correction'];
const BODIES = 'eu_report/reference/provideam_reports';
const SOURCE = 'eu_report/pbi_report/source';

// The flow with a debug node behind the wait, to see the job it sends.
function flowWithJobDebug() {
  const nodes = read('vfc-provideam-fetch.json');
  const wait = nodes.find((n) => n.name === 'Wait for writes 30 s');
  nodes.push({ id: 'jobDebug', type: 'debug', z: wait.z, complete: 'payload', wires: [] });
  wait.wires = [['jobDebug']];
  return nodes;
}

function lakeWithBodies(sites) {
  const lake = new Map();
  for (const site of sites) {
    for (const type of TYPES) {
      const file = { body: { userId: 1, objects: [], periods: [] } };
      // Run rates ask for two functions (Good Parts, Capacity), plan OPT nine.
      file.body.functions = type === 'run_rates' ? [{}, {}] : [];
      if (type === 'volume_loss_correction') {
        file.keepTypes = ['Planned Loss', 'Unplanned Loss'];
      }
      lake.set(`${BODIES}/site=${site}/${type}.json`, JSON.stringify(file));
    }
  }
  return lake;
}

// Made-up answers, one per report path, with the edge cases of the rules.
const ANSWERS = {
  plan: {
    processedData: [
      {
        rowDesc: 'Row_0', fdYYYYMMDD: '2026-11-01', fdAreaName: ' Area A',
        fdMachineName: 'M1', fdShiftName: 'Early', fdShiftStartTime: '2026-11-01T06:00:00',
        fdPartName: '"P,1"', fnGoodParts_0: 955.7, fnDefectParts_0: 2, fnTarget_0: 35999.849,
        fnCapacity_0: 36000, fnOEE_0: 0.5125, fnTotalTime_0: 28800, fnPlannedOpT_0: 27000,
        fnOEETime_0: 11376.5, fnDowntimeUnits_0: 17550
      },
      { rowDesc: 'GrandTotal', fdMachineName: null, fnGoodParts_0: 955.7 }
    ]
  },
  rates: {
    processedData: [
      {
        rowDesc: 'Row_0', fdAreaName: 'Area A', fdMachineName: 'M1',
        fdYYYYMMDDHH: '2026-11-02 05:00', fdPartName: 'P1', fdShiftName: 'Night',
        fnGoodParts_0: 1200, fnCapacity_0: 1700.00016021728
      }
    ]
  },
  modeLog: {
    processedData: [
      {
        fdStartTime: '2026-11-01T06:00:00', fdMachineName: 'M1', fdPartDesc: 'Part desc',
        fdShiftName: 'Early', fdOEELossLvl3Type: 'Run', fdOEELossLvl3SubGroup: 'Run',
        fdOEELossLvl3Desc: 'Run', fdTime: 3600, fdShiftStartDate: '2026-11-01T00:00:00',
        fdModeComment: ''
      },
      {
        fdStartTime: '2026-11-01T07:00:00', fdMachineName: 'M1', fdPartDesc: 'Part desc',
        fdShiftName: 'Early', fdOEELossLvl3Type: 'Unplanned Loss', fdOEELossLvl3SubGroup: 'Adjustment',
        fdOEELossLvl3Desc: 'Labeller', fdTime: 420, fdShiftStartDate: '2026-11-01T00:00:00',
        fdModeComment: '\tReel "A" changes'
      }
    ]
  },
  loss: {
    processedData: [{ rowDesc: 'Row_0', fdMachineName: 'M1' }],
    processedLossData: [
      {
        fdShiftStartDate: '11/1/2026 12:00:00 AM', fdMachineName: 'M1',
        fdOEELossLvl3Type: 'GoodParts', fdOEELossLvl3SubGroup: 'GoodParts',
        fdOEELossLvl3Desc: 'Kilograms', fnTime_0: 97200, fnLossUnits_0: 43560
      },
      {
        fdShiftStartDate: '11/1/2026 12:00:00 AM', fdMachineName: 'M1',
        fdOEELossLvl3Type: 'Unplanned Loss', fdOEELossLvl3SubGroup: 'Adjustment',
        fdOEELossLvl3Desc: 'Labeller', fnTime_0: 420, fnLossUnits_0: 1613.33325195312
      }
    ]
  }
};

function fakeProvideam(fail = () => false) {
  return async (url, init) => {
    const u = new URL(url);
    const body = JSON.parse(init.body);
    const day = body.periods[0].periodParam.pdDay[0];
    const answer = (status, value) => ({
      status,
      text: async () => (value === undefined ? '' : JSON.stringify(value))
    });
    if (init.headers.apiKey !== KEY ||
      init.headers['Content-Type'] !== 'application/json-patch+json') {
      return answer(401);
    }
    if (fail(u.pathname, day)) {
      return answer(500);
    }
    if (u.pathname === '/api/v1/report/objectmodelog') {
      return answer(200, ANSWERS.modeLog);
    }
    if (u.pathname === '/api/v1/report/periodbyobjectandloss') {
      return answer(200, ANSWERS.loss);
    }
    return answer(200, body.functions && body.functions.length === 2 ?
      ANSWERS.rates : ANSWERS.plan);
  };
}

async function run(payload, options = {}) {
  const sites = payload.sites || ['Hull', 'Nottingham'];
  const lake = options.lake || lakeWithBodies(sites);
  const stats = await runFlow(flowWithJobDebug(), {
    startDay: '2026-11-01', startPayload: payload, write: options.write === true,
    configNodes: config, platform: 'xcelerator', lake, clientId: 'x', clientSecret: 'y',
    fetchImpl: fakeProvideam(options.fail)
  });
  const jobs = stats.logs.filter((l) => l && typeof l === 'object' && Array.isArray(l.days));
  const lines = stats.logs.filter((l) => typeof l === 'string');
  return { stats, lake, jobs, lines };
}

// 1. Dry run (the default): calls and converts, writes nothing, no build.
{
  const r = await run({ start: '2026-11-01', end: '2026-11-01' });
  check(r.stats.requests.length === 8, 'dry run: 2 sites x 4 types = 8 calls');
  check(r.stats.written.filter((p) => p.startsWith(SOURCE)).length === 0,
    'dry run: no source file written');
  check(r.jobs.length === 0, 'dry run: no job for the build tabs');
  check(r.lines.some((l) => /dry run: no build/.test(l)), 'dry run: the log says so');
}

// 2. Written run: one file per site, type and day, the export text, one job.
{
  const r = await run({ start: '2026-11-01', end: '2026-11-01' }, { write: true });
  const paths = [...r.lake.keys()].filter((p) => p.startsWith(SOURCE)).sort();
  check(paths.length === 8 && paths.includes(`${SOURCE}/plan_opt/site=Hull/plan_opt_2026-11-01.csv`),
    'write: 8 day files <type>/site=<Site>/<type>_<day>.csv');
  const urls = [...new Set(r.stats.requests.map((q) => new URL(q.url).pathname))].sort();
  check(JSON.stringify(urls) === JSON.stringify([
    '/api/v1/Report/ObjectByPeriod',
    '/api/v1/report/objectmodelog',
    '/api/v1/report/periodbyobjectandloss'
  ]), 'write: the three Provideam report paths');
  check(r.stats.requests.every((q) => JSON.parse(q.body).periods[0].periodParam.pdDay[0] ===
    '[2026-11-01T00:00:00]'), 'write: every call asks for the day as pdDay');
  const file = (type) => r.lake.get(`${SOURCE}/${type}/site=Hull/${type}_2026-11-01.csv`);
  check(file('plan_opt') ===
    'SiteName,YYYY-MM-DD,AreaName,MachineName,ShiftName,ShiftStartTime,PartName,Good Parts,' +
    'Defect Parts,Target,Capacity,OEE,Total Time,Planned OpT,OEE Time,Downtime Units\n' +
    'Hull,2026-11-01, Area A,M1,Early,2026-11-01 06:00:00,"P,1",956,2,35999.85,36000.00,' +
    '51.3%,08:00:00,07:30:00,03:09:36,17550.00\n',
  'plan OPT: whole parts, 2 decimals, OEE half up, half second to even, no total row');
  check(file('run_rates') ===
    'SiteName,AreaName,MachineName,YYYY-MM-DD HH,PartName,ShiftName,Good Parts,Capacity\n' +
    'Hull,Area A,M1,2026-11-02 05:00:00,P1,Night,1200,1700\n',
  'run rates: hour of the production day kept, whole numbers');
  check(file('line_losses') ===
    'SiteName,StartTime,MachineName,PartName,ShiftName,OEELossLvl3Group,OEELossLvl3SubGroup,' +
    'OEELossLvl3Desc,Duration,ShiftStartDate,Comment\n' +
    'Hull,2026-11-01 07:00:00,M1,Part desc,Early,Unplanned Loss,Adjustment,Labeller,' +
    '00:07:00,2026-11-01," Reel ""A"" changes"\n',
  'line losses: no Run events, part description, tab to space, quotes kept in comments');
  check(file('volume_loss_correction') ===
    'SiteName,ShiftStartDate,MachineName,OEELossLvl3Group,OEELossLvl3SubGroup,' +
    'OEELossLvl3Desc,Time,Loss Units\n' +
    'Hull,2026-11-01,M1,Unplanned Loss,Adjustment,Labeller,00:07:00,1613.33\n',
  'correction: only the keepTypes groups, US date turned to YYYY-MM-DD');
  check(r.jobs.length === 1 && JSON.stringify(r.jobs[0]) ===
    JSON.stringify({ sites: ['Hull', 'Nottingham'], days: ['2026-11-01'] }),
  'write: one job {sites, days} for the build tabs');
  check(!JSON.stringify([...r.lake.values(), ...r.stats.logs]).includes(KEY),
    'the API key is in no file and no log line');
  check(r.stats.errors.length === 0, 'write: no node error');
}

// 3. A failed call: the day of that site is not complete, the other site
// builds it; the log says FAILED.
{
  const r = await run({ start: '2026-11-01', end: '2026-11-02' }, {
    write: true,
    fail: (path, day) => path === '/api/v1/report/objectmodelog' && day === '[2026-11-02T00:00:00]'
  });
  check(r.jobs.length === 1 && JSON.stringify(r.jobs[0].days) === JSON.stringify(['2026-11-01']),
    'failed calls: only the day with every type of a site goes to the build');
  check(r.lines.some((l) => /2026-11-02 \[fetch\] Hull line_losses: FAILED Provideam HTTP 500/.test(l)),
    'failed calls: the log names day, site, type and status');
}

// 4. A missing body file: the task is lost, the run still ends (join
// timeout) and the log counts it.
{
  const lake = lakeWithBodies(['Hull']);
  lake.delete(`${BODIES}/site=Hull/run_rates.json`);
  const r = await run({ start: '2026-11-01', end: '2026-11-01', sites: ['Hull'] },
    { write: true, lake });
  check(r.jobs.length === 0 && r.lines.some((l) => /3 of 4 calls back, FAILED 0 calls, 1 lost/.test(l)),
    'missing body file: no build, the log counts the lost call');
}

// 5. Settings refuse what they cannot do.
{
  const before = await run({ start: '2026-10-31', end: '2026-11-01' });
  check(before.stats.requests.length === 0 && before.stats.errors.some((e) => /month files/.test(e)),
    'a day before FIRST_DAY is refused (October is month files)');
  const noKey = await runFlow(flowWithJobDebug(), {
    startDay: '2026-11-01', startPayload: { start: '2026-11-01', end: '2026-11-01' },
    configNodes: read('vfc-config.json'), platform: 'xcelerator', lake: new Map(),
    clientId: 'x', clientSecret: 'y', fetchImpl: fakeProvideam()
  });
  check(noKey.requests.length === 0 && noKey.errors.some((e) => /provideam.apiKey/.test(e)),
    'without the API key in 1.1 CONFIG nothing is called');
}

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('all checks passed');
}
