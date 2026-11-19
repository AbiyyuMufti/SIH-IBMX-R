// SIH explorer: a small local web app to try the SIH API step by step and
// to see how each EU_OEE_Fact column is (or is not) filled from SIH.
// Usage: node scripts/sih-explorer/server.js   then open http://localhost:8780
// Read only: GETs, the token and the approved evaluateKPIs POST, and the
// lake download URLs. The token and secrets stay in this process.
// Listens on 127.0.0.1 only (the answers hold client data).
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cfg, getToken, fetchRetry, servicePath } from '../lib-ih.js';
import { listObjects, downloadOne } from '../lib-datalake.js';
import { runFlow } from '../lib-vfc-runner.js';
import { STEPS } from './steps.js';
import { COLUMNS } from './columns.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const PORT = 8780;
// Client data cache (git-ignored folder).
const CACHE = resolve(ROOT, 'samples', 'sih-explorer');
// Notes are the user's own text, no client values: kept in the repo.
const NOTES = resolve(ROOT, 'prompt-response', 'sih-gap-notes.json');
// Production day start (local hour) per site; others use DEFAULT_START.
const DAY_START = { Hull: 6 };
const DEFAULT_START = 6;
// Site time zones. The time zones in SIH are not reliable (Hull says
// Europe/Berlin, Mira Europe/London), so the site decides; SIH is the fallback.
const SITE_TZ = {
  Hull: 'Europe/London',
  Nottingham: 'Europe/London',
  Chartres: 'Europe/Paris',
  Weinheim: 'Europe/Berlin',
  Mira: 'Europe/Rome',
  Tuzla: 'Europe/Sarajevo',
  STP: 'America/Chicago'
};
// SIH name -> report MachineName (the Config lines of 1.1 CONFIG).
const REPORT_NAME = { 'B2 Line': 'B2 Auto' };
// Lines the SIH report daily tab builds today (Config lines of Hull).
const TAB_LINES = ['B2 Line', 'GT4'];
const FACT_FOLDER = (site) => `eu_report/report/EU_OEE_Fact/site=${site}/`;
const LINE_LIST = 'eu_report/report/Dim/Machine_Names_EU.csv';
mkdirSync(resolve(CACHE, 'lake'), { recursive: true });

const oee = cfg.gateway + servicePath('oee');
const am = cfg.gateway + servicePath('assetmanagement');
const ts = cfg.gateway + servicePath('iottimeseries');

// ---------- token and guarded calls ----------
let token = null;
let tokenUntil = 0;
async function bearer() {
  if (!token || Date.now() > tokenUntil) {
    const t = await getToken();
    token = t.token;
    tokenUntil = Date.now() + (t.expiresIn - 120) * 1000;
  }
  return token;
}
const ALLOWED_POST = [/\/expressions\/evaluateKPIs$/];
async function call(req) {
  if (req.method !== 'GET' && !ALLOWED_POST.some((re) => re.test(req.url))) {
    throw new Error(`refused: ${req.method} ${req.url} is not an approved call`);
  }
  const headers = { Authorization: `Bearer ${await bearer()}`, Accept: req.accept || 'application/json' };
  if (req.body) {
    headers['Content-Type'] = 'application/json';
  }
  const t0 = Date.now();
  const res = await fetchRetry(req.url, { method: req.method, headers, body: req.body ? JSON.stringify(req.body) : undefined });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, ms: Date.now() - t0, body };
}
// Personal data never reaches the page.
const scrub = (v) => JSON.parse(JSON.stringify(v).replace(/"ActorEmail":"[^"]*"/g, '"ActorEmail":"(hidden)"'));

// ---------- the asset tree ----------
let tree = null;
async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}
async function loadTree() {
  const all = [];
  for (let page = 0; ; page++) {
    const r = await call({ method: 'GET', url: `${am}/assets?size=200&page=${page}`, accept: 'application/hal+json' });
    all.push(...(r.body._embedded?.assets || []));
    if (page + 1 >= (r.body.page?.totalPages || 1)) {
      break;
    }
  }
  const oeeList = (await call({ method: 'GET', url: `${oee}/assets` })).body;
  const oeeById = new Map(oeeList.map((a) => [a.assetId, a]));
  const kinds = await pool(oeeList, 4, async (a) => {
    const r = await call({ method: 'GET', url: `${oee}/assets/${a.assetId}/config` });
    const mode = r.body?.operandSource?.good?.mode;
    return [a.assetId, mode === 'CONNECTED' ? 'connected' : mode === 'MANUAL' ? 'manual' : (mode || 'not set').toLowerCase()];
  });
  const kindById = new Map(kinds);
  const nodes = all.map((a) => ({
    id: a.assetId,
    parentId: a.parentId,
    name: a.name.trim(),
    timezone: a.timezone || null,
    type: a.typeId,
    oee: oeeById.has(a.assetId),
    kind: kindById.get(a.assetId) || null,
    configured: oeeById.get(a.assetId)?.isConfigured ?? null,
    reasonTreeId: oeeById.get(a.assetId)?.reasonTreeId || null
  }));
  tree = { loadedAt: new Date().toISOString(), nodes };
  writeFileSync(resolve(CACHE, 'tree.json'), JSON.stringify(tree));
  return tree;
}
async function getTree(refresh) {
  if (!tree && !refresh && existsSync(resolve(CACHE, 'tree.json'))) {
    tree = JSON.parse(readFileSync(resolve(CACHE, 'tree.json'), 'utf8'));
  }
  return !tree || refresh ? loadTree() : tree;
}
function pathOf(id) {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const path = [];
  for (let n = byId.get(id); n; n = byId.get(n.parentId)) {
    path.unshift(n);
  }
  return path;
}

// ---------- production day window ----------
// UTC start of `hour` local time on `day` in time zone `tz`.
function tzOffset(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(ms));
  const p = Object.fromEntries(parts.map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
}
function localToUtc(day, hour, tz) {
  const guess = Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
  return new Date(guess - tzOffset(guess, tz));
}
function windowFor(assetId, day, hour) {
  const path = pathOf(assetId);
  const site = path[2]?.name || '';
  const sihTz = [...path].reverse().find((n) => n.timezone)?.timezone || 'UTC';
  const tz = SITE_TZ[site] || sihTz;
  const start = hour === undefined || hour === '' ? (DAY_START[site] ?? DEFAULT_START) : Number(hour);
  const from = localToUtc(day, start, tz);
  return { site, tz, sihTz, start, from: from.toISOString(), to: new Date(from.getTime() + 86400000).toISOString() };
}

// ---------- steps ----------
const stepCache = new Map();
async function runStep(assetId, day, hour, stepId) {
  const key = [assetId, day, hour, stepId].join('|');
  if (stepCache.has(key)) {
    return stepCache.get(key);
  }
  const step = STEPS.find((s) => s.id === stepId);
  const node = tree.nodes.find((n) => n.id === assetId);
  const win = windowFor(assetId, day, hour);
  const ctx = {
    id: assetId, oee, am, ts, from: win.from, to: win.to, reasonTreeId: node.reasonTreeId,
    tokenUrl: cfg.tokenUrl.replace(/^https:\/\/\d+\./, 'https://<tenant>.'),
    need: async (other) => (await runStep(assetId, day, hour, other)).raw
  };
  const req = await step.request(ctx);
  let result;
  if (step.id === 'token') {
    const t0 = Date.now();
    const t = await getToken();
    result = { status: 200, ms: Date.now() - t0, body: { expires_in: t.expiresIn, token_type: t.tokenType } };
  } else {
    result = await call(req);
  }
  const raw = scrub(result.body);
  let table = null;
  try {
    table = result.status < 400 ? await step.table(raw, ctx) : null;
  } catch (e) {
    table = { head: ['note'], rows: [['could not read the answer: ' + e.message]] };
  }
  const out = {
    step: step.id,
    request: { method: req.method, url: req.url, body: req.body || null },
    status: result.status,
    ms: result.ms,
    window: win,
    table,
    raw,
    error: result.status >= 400 ? JSON.stringify(raw).slice(0, 400) : null
  };
  stepCache.set(key, out);
  return out;
}

// ---------- live EU_OEE_Fact rows from the lake ----------
async function lakeRows(site, day, machine) {
  const files = [];
  let next;
  do {
    const r = await listObjects(await bearer(), FACT_FOLDER(site), next);
    files.push(...(r.body.objects?.files || []));
    next = (r.body.isTruncated === true || r.body.isTruncated === 'true') ? r.body.page?.nextToken : null;
  } while (next);
  const names = files.map((f) => f.key.replace(/^data\/ten=[^/]+\//, ''));
  let pick = names.filter((p) => p.split('/').pop().startsWith(`EU_OEE_Fact_${day}_`));
  if (!pick.length) {
    pick = names.filter((p) => p.endsWith(`EU_OEE_Fact_${day.slice(0, 7)}.parquet`));
  }
  const local = [];
  for (const path of pick) {
    const file = resolve(CACHE, 'lake', path.replace(/[\/=]/g, '_'));
    if (!existsSync(file) || day >= new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)) {
      const got = await downloadOne(await bearer(), path);
      if (got.ok) {
        writeFileSync(file, got.bytes);
      }
    }
    if (existsSync(file)) {
      local.push(file);
    }
  }
  if (!local.length) {
    return { files: [], columns: [], rows: [] };
  }
  const json = execFileSync('python', [resolve(HERE, 'read-fact.py'), day, machine || '-', ...local], { maxBuffer: 256 * 1024 * 1024 });
  return { files: pick, ...JSON.parse(json.toString()) };
}

// ---------- SIH rows, as the SIH report daily tab builds them ----------
// Runs the real tab locally (only the Config lines). Lake nodes in memory.
const sihCache = new Map();
let lineList = null;
async function sihRows(day) {
  if (sihCache.has(day)) {
    return sihCache.get(day);
  }
  const lake = new Map();
  for (const folder of ['eu_report/reference/glidepaths/site=Hull/', 'eu_report/reference/machine_names/site=Hull/', 'eu_report/reference/shift_naming/site=All/']) {
    const r = await listObjects(await bearer(), folder);
    for (const f of r.body.objects?.files || []) {
      const path = f.key.replace(/^data\/ten=[^/]+\//, '');
      const got = await downloadOne(await bearer(), path);
      if (got.ok) {
        lake.set(path, got.bytes.toString('utf8'));
      }
    }
  }
  if (!lineList) {
    const got = await downloadOne(await bearer(), LINE_LIST);
    lineList = new Set((got.ok ? got.bytes.toString('utf8') : '').split(/\r?\n/).slice(1).map((l) => (l.split(',')[2] || '').trim()));
  }
  const flowDir = resolve(ROOT, 'flows', 'legacy_report_generator_v0');
  const run = await runFlow(JSON.parse(readFileSync(resolve(flowDir, 'vfc-pbi-daily-hull.json'), 'utf8')), {
    startDay: day,
    write: true,
    configNodes: JSON.parse(readFileSync(resolve(flowDir, 'vfc-config.json'), 'utf8')),
    lake,
    platform: cfg.platform,
    xcTenantId: process.env.XC_TENANT_ID,
    clientId: process.env.RECKITT_API_TECHUSER_CLIENT_ID,
    clientSecret: process.env.RECKITT_API_TECHUSER_CLIENT_SECRET,
    fetchImpl: async (url, o) => {
      if (o.method !== 'GET' && !/oauth\/token$|evaluateKPIs$/.test(url)) {
        throw new Error('refused ' + url);
      }
      return fetchRetry(url, o);
    }
  });
  // The mapping of the fact tab (e2-fact-rows.js), kept small here.
  const TYPE = { Plan_OPT_EU: 'Plan', Time_Utilisation_EU: 'Time Utilisation', Daily_Losses_EU: 'Loss' };
  const RENAME = { Date: 'Event Date', ShiftStartDate: 'Date', 'Shift colour': 'Shift Colour', target: 'Loss Target' };
  const DAY_MS = 86400000;
  const rows = [];
  for (const [node, payloads] of Object.entries(run.parquetPayloads)) {
    const type = TYPE[node.replace(/^Write | parquet$/g, '')];
    for (const src of payloads.flat()) {
      const row = { 'Record Type': type };
      for (const [k, v] of Object.entries(src)) {
        row[type === 'Loss' && RENAME[k] ? RENAME[k] : k] = v;
      }
      for (const c of ['Date', 'Event Date']) {
        if (typeof row[c] === 'number') {
          row[c] = new Date(row[c] * DAY_MS).toISOString().slice(0, 10);
        }
      }
      if (type === 'Loss' && typeof row.Time === 'number') {
        row.Time = '1970-01-01 ' + new Date(row.Time).toISOString().slice(11, 19);
      }
      row['In EU Report Source'] = src['In EU Report'] ?? null;
      row['In EU Report'] = lineList.has(row['Unique Machine Name']);
      rows.push(row);
    }
  }
  const out = { rows, log: run.logs.map(String), errors: run.errors };
  sihCache.set(day, out);
  return out;
}

// ---------- http ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
async function readBody(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
  }
  return JSON.parse(text || '{}');
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const q = Object.fromEntries(url.searchParams);
  try {
    if (url.pathname === '/api/tree') {
      return send(res, 200, await getTree(q.refresh === '1'));
    }
    if (url.pathname === '/api/meta') {
      return send(res, 200, {
        steps: STEPS.map(({ id, title, why, feeds, used }) => ({ id, title, why, feeds, used })),
        columns: COLUMNS,
        reportName: REPORT_NAME,
        tabLines: TAB_LINES,
        platform: cfg.platform
      });
    }
    if (url.pathname === '/api/step') {
      await getTree();
      return send(res, 200, await runStep(q.asset, q.day, q.hour ?? '', q.step));
    }
    if (url.pathname === '/api/fact') {
      await getTree();
      const site = pathOf(q.asset)[2]?.name;
      const name = tree.nodes.find((n) => n.id === q.asset)?.name;
      const machine = q.machine || REPORT_NAME[name] || name;
      return send(res, 200, { site, machine, ...(await lakeRows(site, q.day, machine)) });
    }
    if (url.pathname === '/api/sihrows') {
      const all = await sihRows(q.day);
      return send(res, 200, { ...all, rows: all.rows.filter((r) => !q.machine || r.MachineName === q.machine) });
    }
    if (url.pathname === '/api/notes') {
      const notes = existsSync(NOTES) ? JSON.parse(readFileSync(NOTES, 'utf8')) : {};
      if (req.method === 'POST') {
        const { col, text } = await readBody(req);
        notes[col] = String(text || '').slice(0, 4000);
        writeFileSync(NOTES, JSON.stringify(notes, null, 2) + '\n');
      }
      return send(res, 200, notes);
    }
    const file = resolve(HERE, 'public', url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (file.startsWith(resolve(HERE, 'public')) && existsSync(file)) {
      return send(res, 200, readFileSync(file), TYPES[extname(file)] || 'application/octet-stream');
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`SIH explorer on http://localhost:${PORT} (platform ${cfg.platform})`);
});
