// Proof that the platform switch changes nothing else. Runs the flows as
// they were before the switch (read from git, tag or commit in OLD_REF,
// with the mock of that commit) and the rebuilt flows on both platforms,
// all on the same mock data, and compares requests, logs, errors, parquet
// rows and files in the lake. Usage: node scripts/test-platform-switch.js
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runFlow } from './lib-vfc-runner.js';
import { makeMockFetch } from './lib-mock-ih.js';

// The commit before the switch.
const OLD_REF = process.env.OLD_REF || 'da968fc';
const DAY = '2026-09-30';
const LEGACY_API = 'https://gateway.eu1.mindsphere.io/api/';
const XC_API = /^https:\/\/api\.eu1\.siemens\.app\/api\/([a-z]+)-1000001700\//;
const scratch = mkdtempSync(join(tmpdir(), 'switch-'));

const git = (path) => execFileSync('git', ['show', `${OLD_REF}:${path}`], {
  cwd: new URL('..', import.meta.url),
  maxBuffer: 64 * 1024 * 1024
}).toString('utf8');
const readOld = (file) => JSON.parse(git('flows/' + file));
const readNew = (file) => JSON.parse(
  readFileSync(new URL('../flows/' + file, import.meta.url), 'utf8')
);

// The mock of the old commit, loaded from a temporary file.
const oldMockFile = join(scratch, 'old-mock.js');
writeFileSync(oldMockFile, git('scripts/lib-mock-ih.js'));
const oldMock = await import(pathToFileURL(oldMockFile).href);

const flows = [
  { file: 'vfc-site-hull.json', scenarios: [
    'ok', 'token-fail', 'list-fail', 'kpi-fail', 'kpi-413', 'details-fail',
    'stops-fail', 'stops-paged', 'no-data', 'unmapped'
  ] },
  { file: 'vfc-reference-tables.json', scenarios: [
    'ok', 'ref-config-fail', 'ref-detail-fail', 'token-fail'
  ] },
  // Since 2026-10-21 (SIH report daily: report columns, local production
  // day) this tab differs from the old commit on purpose. It is compared with
  // itself: the new tab on legacy against both platforms, API calls and
  // errors only. Its rows: scripts/test-vfc-sih-report.js.
  { file: 'vfc-pbi-daily-hull.json', callsOnly: true, scenarios: [
    'ok', 'products', 'products-fail', 'values-fail', 'value-kpi-fail',
    'no-collection', 'token-fail', 'kpi-fail'
  ] },
  { file: 'vfc-pbi-reference.json', scenarios: [
    'ok', 'ref-config-fail', 'ref-detail-fail', 'token-fail'
  ] }
];

// The reference files the site setup of the SIH report daily tab reads.
const referenceLake = () => new Map([
  ['eu_report/reference/glidepaths/site=Hull/G.csv',
    'Site Name,Line,OEE Bucket,01/09/2026\nHull,X,% OEE,1\n'],
  ['eu_report/reference/machine_names/site=Hull/M.csv',
    'MachineName,Dept,Area,Product Type\nX,D,A,P\n'],
  ['eu_report/reference/shift_naming/site=All/S.csv',
    'ShiftName,Shift\nMonDay,Day\n']
]);

let failures = 0;
const check = (ok, text) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + text);
  if (!ok) {
    failures++;
  }
};

const options = (config, mock, scenario, extra) => ({
  startDay: DAY, write: true, configNodes: config, lake: new Map(),
  fetchImpl: mock(scenario), clientId: 'x', clientSecret: 'y',
  allAssets: true, ...extra
});

// Requests as a list of text lines. The token request is reduced to its
// kind, because the address and the body differ by design.
function requestLines(stats, platform) {
  return stats.requests.map((r) => {
    if (/\/oauth\/token/.test(r.url)) {
      return 'TOKEN ' + r.method;
    }
    let url = r.url;
    if (platform === 'xcelerator') {
      url = url.replace(XC_API, LEGACY_API.replace('/api/', '/api/') + '$1/');
    }
    return r.method + ' ' + url + ' ' + (r.body || '');
  });
}

// The clock of the run is the only thing that differs between two runs:
// loaded_at in the rows and the time in the first column of the log lines.
// Both are masked, everything else is compared exactly.
// One more mask: product_type of pbi_machine_names. The old flows were taken
// before 2026-10-13 (null), the new one carries the area on purpose (decision
// of the user), which has nothing to do with the platform switch.
// Also masked: the root folder. Since the general report configuration
// (2026-10-20) the root is eu_report and the Insights Hub tables go to
// candidate/sih/; the old flows wrote to mufti_test/.
function noClock(text) {
  let out = String(text);
  out = out.replace(/eu_report\/candidate\/sih\//g, 'mufti_test/');
  out = out.replace(/eu_report\//g, 'mufti_test/');
  out = out.replace(/"loaded_at":[0-9]+/g, '"loaded_at":0');
  out = out.replace(/"product_type":(null|"[^"]*")/g, '"product_type":0');
  out = out.replace(/^"[0-9T:.-]+Z"/gm, '"time"');
  return out;
}

function lakeLines(stats) {
  return [...stats.lake].map(([path, text]) => path + '\n' + noClock(text));
}

const same = (a, b) => noClock(JSON.stringify(a)) === noClock(JSON.stringify(b));

async function compare(label, oldStats, newStats, platform, callsOnly) {
  check(
    same(requestLines(oldStats, 'legacy'), requestLines(newStats, platform)),
    `${label}: same requests (${oldStats.requests.length})`
  );
  if (callsOnly) {
    check(same(oldStats.errors, newStats.errors), `${label}: same errors`);
    return;
  }
  check(same(oldStats.logs, newStats.logs), `${label}: same logs`);
  check(same(oldStats.errors, newStats.errors), `${label}: same errors`);
  check(
    same(oldStats.parquetRows, newStats.parquetRows),
    `${label}: same parquet row counts`
  );
  check(
    same(oldStats.parquetPayloads, newStats.parquetPayloads),
    `${label}: same parquet rows`
  );
  check(same(oldStats.written, newStats.written), `${label}: same file paths`);
  check(same(lakeLines(oldStats), lakeLines(newStats)), `${label}: same lake`);
}

const oldConfig = readOld('flows/vfc-config.json'.replace('flows/', ''));
const newConfig = readNew('vfc-config.json');

for (const flow of flows) {
  const oldNodes = readOld(flow.file);
  const newNodes = readNew(flow.file);
  for (const scenario of flow.scenarios) {
    const oldStats = flow.callsOnly
      ? await runFlow(newNodes, options(newConfig, makeMockFetch, scenario, {
        platform: 'legacy',
        lake: referenceLake()
      }))
      : await runFlow(
        oldNodes,
        options(oldConfig, oldMock.makeMockFetch, scenario, {})
      );
    for (const platform of ['legacy', 'xcelerator']) {
      const label = `${flow.file} ${scenario} [${platform}]`;
      const newStats = await runFlow(
        newNodes,
        options(newConfig, makeMockFetch, scenario, {
          platform,
          lake: flow.callsOnly ? referenceLake() : new Map()
        })
      );
      await compare(label, oldStats, newStats, platform, flow.callsOnly);
      // On xcelerator every request must use the new host and the suffix.
      if (platform === 'xcelerator') {
        const api = newStats.requests.filter((r) => !/oauth/.test(r.url));
        const bad = api.filter((r) => !XC_API.test(r.url));
        check(bad.length === 0, `${label}: all API calls on the new host`);
        const tokens = newStats.requests.filter((r) => /oauth/.test(r.url));
        const goodToken = tokens.every((r) => (
          /^https:\/\/[0-9]{10}\.eu1\.sws\.siemens\.com\/oauth\/token$/.test(r.url)
          && r.body === 'grant_type=client_credentials'
        ));
        check(goodToken, `${label}: token request on the new host, form body`);
      } else {
        const bad = newStats.requests.filter((r) => /siemens/.test(r.url));
        check(bad.length === 0, `${label}: no call on the new host`);
      }
    }
  }
}

// The Config node refuses a missing or wrong platform and clears the settings.
function configProblem(platform, tenant) {
  const text = newConfig.find((n) => n.type === 'function').func
    .replace(/platform: '[^']*'/, `platform: '${platform}'`)
    .replace(/xcTenantId: '[^']*'/, `xcTenantId: '${tenant}'`);
  const store = { cfg: { old: true } };
  const messages = [];
  const node = { status: (s) => messages.push(s.text), error: () => {} };
  const glob = { get: (k) => store[k], set: (k, v) => { store[k] = v; } };
  new Function('node', 'glob', text)(node, glob);
  return { stored: store.cfg, text: messages[0] };
}

const missing = configProblem('SET_legacy_OR_xcelerator', '1234567890');
check(missing.stored === undefined, 'Config: placeholder platform clears cfg');
check(/platform must be/.test(missing.text), `Config: message "${missing.text}"`);
const wrong = configProblem('Legacy', '1234567890');
check(wrong.stored === undefined, 'Config: wrong spelling is refused');
const noTenant = configProblem('xcelerator', 'PUT_TENANT_ID_HERE');
check(noTenant.stored === undefined, 'Config: xcelerator needs the tenant ID');
const fine = configProblem('legacy', 'PUT_TENANT_ID_HERE');
check(fine.stored && fine.stored.platform === 'legacy', 'Config: legacy needs no tenant ID');

// A token from the other platform is refused (b and d of the smoke check).
const mixed = await makeMockFetch('ok')(
  'https://gateway.eu1.mindsphere.io/api/oee/v3/health',
  { headers: { Authorization: 'Bearer mock-token-xc' } }
);
check(mixed.status === 403, 'mock: new token on the old host = 403');
const mixed2 = await makeMockFetch('ok')(
  'https://api.eu1.siemens.app/api/oee-1000001700/v3/health',
  { headers: { Authorization: 'Bearer mock-token' } }
);
check(mixed2.status === 401, 'mock: old token on the new host = 401');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exitCode = failures ? 1 : 0;
