// Fetches everything the SIH walkthrough page shows for one production day,
// then builds the page. Read only: GETs, plus the read-style POSTs already
// approved (token, evaluateKPIs) and the lake download URLs. Any other call
// is refused by the guard below.
// Usage: node scripts/sih-walkthrough.js day=2026-11-17 [focus=B2 Line,GT4]
// Out (git-ignored, real data): samples/sih-walkthrough/<day>/
//   data.json        every call (request, status, time, response) + lists
//   fact/*.parquet   the live EU_OEE_Fact day files of Hull
//   fact.json        those rows as JSON (helper-sih-walkthrough-fact.py)
//   index.html       the page (sih-walkthrough-page.js)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cfg, getToken, fetchRetry, servicePath } from './lib-ih.js';
import { listObjects, downloadOne } from './lib-datalake.js';
import { runFlow } from './lib-vfc-runner.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(name + '='));
  return hit ? hit.slice(name.length + 1) : null;
};
const DAY = arg('day');
if (!/^\d{4}-\d{2}-\d{2}$/.test(DAY || '')) {
  console.error('usage: node scripts/sih-walkthrough.js day=YYYY-MM-DD');
  process.exit(2);
}
const FOCUS = (arg('focus') || 'B2 Line,GT4').split(',');
const SITE = 'Hull';
const LAKE_FACT = `eu_report/report/EU_OEE_Fact/site=${SITE}/`;
const LAKE_REF = [
  `eu_report/reference/glidepaths/site=${SITE}/`,
  `eu_report/reference/machine_names/site=${SITE}/`,
  'eu_report/reference/shift_naming/site=All/'
];
const LINE_LIST = 'eu_report/report/Dim/Machine_Names_EU.csv';
const OUT = resolve(ROOT, 'samples', 'sih-walkthrough', DAY);
mkdirSync(resolve(OUT, 'fact'), { recursive: true });

// Hull production day: 06:00 local (Europe/London). Winter only: UTC = local.
// shortcut: no summer time, rerun for a summer day needs from = 05:00Z.
const FROM = `${DAY}T06:00:00.000Z`;
const TO = new Date(Date.parse(FROM) + 86400000).toISOString();

// ---------- guard and recorder ----------
const ALLOWED_POST = [/\/oauth\/token$/, /\/expressions\/evaluateKPIs$/];
const calls = [];
function maskBody(text) {
  return text.replace(/"access_token"\s*:\s*"[^"]+"/, '"access_token":"<TOKEN>"')
    .replace(/"ActorEmail"\s*:\s*"[^"]*"/g, '"ActorEmail":"<EMAIL>"');
}
async function recorded(url, options = {}, meta = {}) {
  const method = options.method || 'GET';
  if (method !== 'GET' && !ALLOWED_POST.some((re) => re.test(url))) {
    throw new Error(`guard: ${method} ${url} is not an approved call`);
  }
  const t0 = Date.now();
  const res = await fetchRetry(url, options);
  const text = await res.text();
  calls.push({
    ...meta,
    method,
    url: url.replace(/^https:\/\/\d+\./, 'https://<tenant>.'),
    body: options.body && !/oauth/.test(url) ? options.body : null,
    status: res.status,
    ms: Date.now() - t0,
    response: maskBody(text)
  });
  return { status: res.status, text: async () => text, json: () => JSON.parse(text) };
}

// ---------- 1. the SIH report daily tab, run locally on the real API ----------
// The tab's own calls, in its own order. Lake nodes are in memory: nothing
// is written to the real lake. Reference files are copied in from the lake.
const token = (await getToken()).token;
// Files of one lake folder, all pages.
async function listAll(folder) {
  const files = [];
  let next;
  do {
    const r = await listObjects(token, folder, next);
    files.push(...((r.body.objects && r.body.objects.files) || []));
    const more = r.body.isTruncated === true || r.body.isTruncated === 'true';
    next = more ? r.body.page && r.body.page.nextToken : null;
  } while (next);
  return files;
}
const lake = new Map();
for (const folder of LAKE_REF) {
  for (const o of await listAll(folder)) {
    const path = o.key.replace(/^data\/ten=[^/]+\//, '');
    const got = await downloadOne(token, path);
    if (got.ok) {
      lake.set(path, got.bytes.toString('utf8'));
    }
  }
}
console.log('reference files in the in-memory lake:', lake.size);
const flowDir = resolve(ROOT, 'flows', 'legacy_report_generator_v0');
const config = JSON.parse(readFileSync(resolve(flowDir, 'vfc-config.json'), 'utf8'));
const daily = JSON.parse(readFileSync(resolve(flowDir, 'vfc-pbi-daily-hull.json'), 'utf8'));
let step = 0;
const tab = await runFlow(daily, {
  startDay: DAY,
  write: true,
  configNodes: config,
  lake,
  platform: cfg.platform,
  xcTenantId: process.env.XC_TENANT_ID,
  clientId: process.env.RECKITT_API_TECHUSER_CLIENT_ID,
  clientSecret: process.env.RECKITT_API_TECHUSER_CLIENT_SECRET,
  fetchImpl: (url, o) => recorded(url, o, { part: 'tab', seq: ++step })
});
const tabRows = {};
for (const [node, payloads] of Object.entries(tab.parquetPayloads)) {
  tabRows[node.replace(/^Write | parquet$/g, '')] = payloads.flat();
}
console.log('tab calls:', step, 'rows:', JSON.stringify(
  Object.fromEntries(Object.entries(tabRows).map(([k, v]) => [k, v.length]))));
tab.errors.forEach((e) => console.log('TAB ERROR', e));

// ---------- 2. every OEE asset: where it sits and whether it has data ----------
const oee = cfg.gateway + servicePath('oee');
const am = cfg.gateway + servicePath('assetmanagement');
const ts = cfg.gateway + servicePath('iottimeseries');
const H = (accept = 'application/json') => ({
  Authorization: `Bearer ${token}`, Accept: accept
});
const get = async (url, meta, accept) => {
  const r = await recorded(url, { headers: H(accept) }, meta);
  try {
    return { status: r.status, body: r.json() };
  } catch {
    return { status: r.status, body: null };
  }
};
const kpiTotals = async (assetId, meta) => {
  const r = await recorded(`${oee}/expressions/evaluateKPIs`, {
    method: 'POST',
    headers: { ...H(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetId,
      scope: { from: FROM, to: TO, filter: [], recursive: false, groupedByDateTime: false }
    })
  }, meta);
  let body = null;
  try {
    body = r.json();
  } catch {
    body = null;
  }
  const value = (name) => {
    const hit = (body?.results || []).find((k) => k.name === name);
    return hit ? hit.value : null;
  };
  return {
    status: r.status,
    good: value('Good parts'),
    total: value('Total parts'),
    oee: value('OEE'),
    operational: value('Operational time'),
    missing: body?.missingMapping || null
  };
};

const assetList = await get(`${oee}/assets`, { part: 'machines', what: 'OEE asset list' });
const machines = [];
for (const a of assetList.body || []) {
  const detail = await get(`${am}/assets/${a.assetId}`,
    { part: 'machines', what: 'hierarchy', asset: a.name, quiet: true }, 'application/hal+json');
  const path = (detail.body?.hierarchyPath || []).map((p) => p.name);
  const kpi = await kpiTotals(a.assetId, { part: 'machines', what: 'day totals', asset: a.name, quiet: true });
  machines.push({
    assetId: a.assetId,
    name: a.name,
    description: a.description || '',
    isManual: a.isManual,
    isConfigured: a.isConfigured,
    reasonTreeId: a.reasonTreeId || null,
    path,
    kpi
  });
  process.stdout.write('.');
}
console.log('\nOEE assets:', machines.length);

// ---------- 3. extra calls for the focus machines (not in the tab) ----------
const q = `from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`;
const extras = {};
for (const name of FOCUS) {
  const m = machines.find((x) => x.name === name);
  if (!m) {
    console.log('focus machine not found:', name);
    continue;
  }
  const id = m.assetId;
  const meta = (what) => ({ part: 'extra', what, asset: name });
  const e = extras[name] = {};
  e.config = await get(`${oee}/assets/${id}/config`, meta('asset config'));
  for (const s of ['productSource', 'orderSource', 'designSpeedSource', 'stateTableSource']) {
    e[s] = await get(`${oee}/assets/${id}/${s}`, meta(s));
  }
  e.manualInputs = await get(`${oee}/assets/${id}/manualInputs?${q}`, meta('manual inputs'));
  e.hourly = await get(`${ts}/timeseries/${id}/OEE_Hourly_Entry?${q}&limit=2000`, meta('hourly entries'));
  e.comment = await get(`${oee}/assets/${id}/comment?${q}`, meta('comments'));
  if (m.reasonTreeId) {
    e.reasons = await get(`${oee}/reasontrees/${m.reasonTreeId}/reasons`, meta('reason tree'));
  }
}
const timeModel = await get(`${oee}/timeModel`, { part: 'extra', what: 'time model' });

// ---------- 4. the live EU_OEE_Fact day files and the line list ----------
const factFiles = [];
for (const o of await listAll(LAKE_FACT)) {
  const path = o.key.replace(/^data\/ten=[^/]+\//, '');
  const file = path.split('/').pop();
  if (!file.startsWith(`EU_OEE_Fact_${DAY}_`)) {
    continue;
  }
  const got = await downloadOne(token, path);
  if (got.ok) {
    writeFileSync(resolve(OUT, 'fact', file), got.bytes);
    factFiles.push({ path, size: got.bytes.length });
  }
}
console.log('fact day files:', factFiles.map((f) => f.path.split('/').pop()).join(', ') || 'NONE');
const lineList = await downloadOne(token, LINE_LIST);

writeFileSync(resolve(OUT, 'data.json'), JSON.stringify({
  day: DAY,
  window: { from: FROM, to: TO },
  platform: cfg.platform,
  site: SITE,
  focus: FOCUS,
  builtAt: new Date().toISOString(),
  calls,
  tab: { rows: tabRows, logs: tab.logs.map(String), errors: tab.errors },
  machines,
  extras,
  timeModel,
  factFiles,
  lineListCsv: lineList.ok ? lineList.bytes.toString('utf8') : null,
  referenceFiles: [...lake.keys()].filter((k) => !k.includes('/logs/'))
}));
console.log('calls recorded:', calls.length);

execFileSync('python', [resolve(ROOT, 'scripts', 'helper-sih-walkthrough-fact.py'), OUT], { stdio: 'inherit' });
execFileSync(process.execPath, [resolve(ROOT, 'scripts', 'sih-walkthrough-page.js'), OUT], { stdio: 'inherit' });
