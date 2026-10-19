// Probe for the shift report (steps A to F of prompt-response/shift-report-data-map.md).
// Read only: GET, plus the read-style POSTs approved before (evaluateKPIs,
// timeModelCategoryDistribution). One call per second. B2 Line and its machines.
// Run: node scripts/test-shift-report.js [YYYY-MM-DD] [steps=A,A2,B,C,D,E,F,G]
// Needs .env (IH_PLATFORM and the technical user). Nothing is written to the API.
// Console output is also saved to samples/shift-report-summary.txt, raw answers
// (ids and emails hidden) to samples/shift_*.json. Both are git-ignored.
import { writeFileSync, mkdirSync } from 'node:fs';
import { cfg, getToken, apiGet, apiPath, saveSample } from './lib-ih.js';

const DAY = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || '2026-09-15';
const OTHER_DAY = '2026-10-08';
const stepArg = process.argv.find((a) => a.startsWith('steps='));
const STEPS = stepArg ? stepArg.slice(6).split(',') : ['A', 'A2', 'B', 'C', 'D', 'E', 'F'];
// Steps A and A2 find the machines and the products the other steps need.
const NEEDS = { B: ['A'], C: ['A'], D: ['A', 'A2'], E: ['A'], G: ['A'] };
STEPS.slice().forEach((s) => (NEEDS[s] || []).forEach((n) => {
  if (!STEPS.includes(n)) {
    STEPS.unshift(n);
  }
}));
const DAY_START_HOUR_UTC = 6;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const HAL = 'application/hal+json';
const AM = '/api/assetmanagement/v3';
const OEE = '/api/oee/v3';
const TS = '/api/iottimeseries/v3/timeseries';
const LINE_NAME = 'B2 Line';

const lines = [];
function say(text = '') {
  console.log(text);
  lines.push(text);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (ms) => new Date(ms).toISOString();
const short = (v, n = 200) => JSON.stringify(v).slice(0, n);
const safe = (name) => name.replace(/\W+/g, '_');

function window(day) {
  const from = Date.parse(`${day}T00:00:00.000Z`) + DAY_START_HOUR_UTC * HOUR_MS;
  return { from, to: from + DAY_MS };
}

const tok = await getToken();

async function get(path, query, accept) {
  await sleep(1000);
  return apiGet(path, tok.token, { query, accept });
}

async function post(path, body) {
  await sleep(1000);
  const res = await fetch(cfg.gateway + apiPath(path), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

function kpiBody(id, w, extra = {}) {
  return {
    assetId: id,
    scope: {
      from: iso(w.from),
      to: iso(w.to),
      filter: [{ key: 'PRODUCT', value: [] }],
      recursive: false,
      groupedByDateTime: false,
      ...extra,
    },
  };
}

// Each step catches its own errors, so one failure does not stop the rest.
async function step(name, title, fn) {
  if (!STEPS.includes(name)) {
    return;
  }
  say(`\n=== ${name}. ${title} ===`);
  try {
    await fn();
  } catch (e) {
    say(`STEP FAILED: ${e.message}`);
  }
}

say(`Shift report probe, platform ${cfg.platform}, day ${DAY}, steps ${STEPS.join(',')}`);

// ---- Setup: find the real B2 Line (not the test copy) ----------------------
const oeeList = (await get(`${OEE}/assets`)).body;
say(`OEE assets: ${Array.isArray(oeeList) ? oeeList.length : 'answer is not a list'}`);
const oeeById = Object.fromEntries((oeeList || []).map((a) => [a.assetId, a]));
let line = null;
for (const c of (oeeList || []).filter((a) => a.name === LINE_NAME)) {
  const d = await get(`${AM}/assets/${c.assetId}`, undefined, HAL);
  const path = ((d.body && d.body.hierarchyPath) || []).map((p) => p.name);
  if (!path.includes('Test Line')) {
    line = { id: c.assetId, name: c.name };
  }
}
if (!line) {
  say(`${LINE_NAME} not found outside Test Line. Stop.`);
  process.exit(1);
}
say(`Line found: ${line.name}`);
let machines = [];

await step('A', 'Machines of the line', async () => {
  const r = await get(
    `${AM}/assets`,
    { filter: JSON.stringify({ parentId: line.id }), size: 200 },
    HAL,
  );
  const kids = (r.body && r.body._embedded && r.body._embedded.assets) || [];
  say(`children: HTTP ${r.status}, ${kids.length}`);
  for (const k of kids) {
    const o = oeeById[k.assetId];
    const type = String(k.typeId || '').split('.').pop();
    say(`  ${k.name} | type ${type} | OEE ${o ? 'yes' : 'no'}` +
      ` | manual ${o ? o.isManual : '-'} | configured ${o ? o.isConfigured : '-'}`);
    if (o) {
      machines.push({ id: k.assetId, name: k.name });
    }
  }
  say(`machines that are OEE assets: ${machines.length}`);
  saveSample('shift_A_children.json', r.body);
});

let dayProducts = [];
await step('A2', 'Orders and products of B2 Line (the batch_id question)', async () => {
  for (const day of [DAY, OTHER_DAY]) {
    const w = window(day);
    const r = await get(`${OEE}/assets/${line.id}/filterValues`, {
      from: iso(w.from),
      to: iso(w.to),
    });
    const list = (r.body && r.body.filterValues) || [];
    const count = (key) => ((list.find((f) => f.key === key) || {}).value || []).length;
    say(`${day}: HTTP ${r.status}, orders ${count('order')}, products ${count('product')},` +
      ` shifts ${count('shift')}`);
    if (day === DAY) {
      dayProducts = (list.find((f) => f.key === 'product') || {}).value || [];
    }
    saveSample(`shift_A2_filterValues_${day}.json`, r.body);
  }
});

const MAIN_KPIS = [
  'OEE', 'Availability', 'Performance', 'Quality', 'Total parts', 'Good parts',
  'Rejected parts', 'Operational time', 'Downtime (duration)', 'Micro stops (duration)',
];
await step('B', 'evaluateKPIs per machine', async () => {
  const w = window(DAY);
  for (const m of machines) {
    const r = await post(`${OEE}/expressions/evaluateKPIs`, kpiBody(m.id, w));
    const results = (r.body && r.body.results) || [];
    const filled = results.filter((x) => x.value !== null && x.value !== undefined);
    const main = MAIN_KPIS.map((n) => {
      const x = results.find((y) => y.name === n);
      return `${n}=${x ? x.value : '-'}`;
    });
    say(`${m.name}: HTTP ${r.status}, ${results.length} KPIs, ${filled.length} with a value`);
    say(`   ${main.join('; ')}`);
    saveSample(`shift_B_kpi_${safe(m.name)}.json`, r.body);
  }
});

function rowsOf(body) {
  return (body && body._embedded && body._embedded.downtimeReasons) || [];
}

await step('C', 'downtimeReasons and topDowntimeReasons per machine', async () => {
  const w = window(DAY);
  for (const m of machines) {
    const q = { from: iso(w.from), to: iso(w.to), size: 5000, page: 0 };
    const r = await get(`${OEE}/assets/${m.id}/downtimeReasons`, q);
    const rows = rowsOf(r.body);
    const counts = {};
    rows.forEach((x) => {
      counts[x.reason] = (counts[x.reason] || 0) + 1;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    say(`${m.name}: HTTP ${r.status}, ${rows.length} rows, ${Object.keys(counts).length} reasons`);
    say(`   top reasons: ${top.map(([k, v]) => `${k} (${v})`).join('; ')}`);
    saveSample(`shift_C_downtime_${safe(m.name)}.json`, r.body);
    const t = await get(`${OEE}/assets/${m.id}/topDowntimeReasons`, { from: q.from, to: q.to });
    say(`   topDowntimeReasons: HTTP ${t.status} ${short(t.body, 220)}`);
  }
});

// Time series of the line around one product change (test 6).
async function changeover(segments) {
  const w = window(DAY);
  const firstHour = {};
  const lastHour = {};
  for (const p of dayProducts) {
    const r = await post(`${OEE}/expressions/evaluateKPIs`, {
      assetId: line.id,
      scope: {
        from: iso(w.from),
        to: iso(w.to),
        filter: [{ key: 'PRODUCT', value: [p] }],
        recursive: false,
        groupedByDateTime: true,
      },
    });
    const total = ((r.body && r.body.results) || []).find((x) => x.name === 'Total parts');
    (total ? total.groups : []).forEach((g) => {
      if (Number(g.value) > 0) {
        const t = Date.parse(g.time);
        firstHour[p] = Math.min(firstHour[p] ?? t, t);
        lastHour[p] = Math.max(lastHour[p] ?? t, t);
      }
    });
  }
  const order = Object.keys(firstHour).sort((a, b) => firstHour[a] - firstHour[b]);
  if (order.length < 2) {
    say('changeover: fewer than 2 products with parts that day, skipped');
    return;
  }
  const from = lastHour[order[0]];
  const to = Math.min(firstHour[order[1]] + HOUR_MS, from + 3 * HOUR_MS);
  say(`changeover window: ${iso(from)} to ${iso(to)} (product 1 last hour to product 2 first hour)`);
  const ups = [];
  let prev = null;
  let cursor = from;
  for (let page = 0; page < 6 && cursor < to; page++) {
    const r = await get(`${TS}/${line.id}/OEE_Prerequisites`, {
      from: iso(cursor),
      to: iso(to),
      limit: 2000,
      sort: 'asc',
    });
    const recs = Array.isArray(r.body) ? r.body : [];
    for (const rec of recs) {
      if (rec.GoodParts === undefined) {
        continue;
      }
      if (prev !== null && rec.GoodParts > prev) {
        ups.push(Date.parse(rec._time));
      }
      prev = rec.GoodParts;
    }
    if (recs.length < 2000) {
      break;
    }
    cursor = Date.parse(recs[recs.length - 1]._time) + 1;
  }
  say(`GoodParts increases found: ${ups.length}`);
  let gap = null;
  for (let i = 1; i < ups.length; i++) {
    if (!gap || ups[i] - ups[i - 1] > gap[1] - gap[0]) {
      gap = [ups[i - 1], ups[i]];
    }
  }
  if (!gap) {
    say('no gap found (line series on this window has no GoodParts increases)');
    return;
  }
  say(`longest gap between good parts: ${iso(gap[0])} to ${iso(gap[1])}` +
    ` = ${Math.round((gap[1] - gap[0]) / 60000)} min`);
  const near = segments.filter((s) => Date.parse(s.to) > gap[0] && Date.parse(s.from) < gap[1]);
  near.slice(0, 12).forEach((s) => {
    say(`   segment ${s.timeCategoryName} ${s.from} to ${s.to}`);
  });
}

await step('D', 'Time segments and status distribution per machine', async () => {
  const w = window(DAY);
  const targets = [{ id: line.id, name: `${line.name} (line)` }, ...machines];
  let lineSegments = [];
  for (const m of targets) {
    const body = {
      from: iso(w.from),
      to: iso(w.to),
      filter: [{ key: 'PRODUCT', value: [] }, { key: 'ORDER', value: [] }],
      force: true,
    };
    const r = await post(`${OEE}/assets/${m.id}/timeModelCategoryDistribution`, body);
    const segs = (r.body && r.body.distribution) || [];
    const totals = {};
    segs.forEach((s) => {
      const ms = Date.parse(s.to) - Date.parse(s.from);
      totals[s.timeCategoryName] = (totals[s.timeCategoryName] || 0) + ms;
    });
    const hours = Object.entries(totals).map(([k, v]) => `${k} ${(v / HOUR_MS).toFixed(1)} h`);
    say(`${m.name}: segments HTTP ${r.status}, ${segs.length} segments; ${hours.join('; ')}`);
    saveSample(`shift_D_segments_${safe(m.name)}.json`, r.body);
    if (m.id === line.id) {
      lineSegments = segs;
    }
    const q = { from: iso(w.from), to: iso(w.to) };
    const s = await get(`${OEE}/assets/${m.id}/statusDistribution`, q);
    say(`   statusDistribution: HTTP ${s.status}, totalCount ${s.body && s.body.totalCount},` +
      ` totalDuration ${s.body && s.body.totalDuration}`);
  }
  await changeover(lineSegments);
});

await step('E', 'Aspects, aspect types and counters', async () => {
  for (const m of machines) {
    const r = await get(`${AM}/assets/${m.id}/aspects`, undefined, HAL);
    const names = ((r.body && r.body._embedded && r.body._embedded.aspects) || [])
      .map((a) => a.name);
    say(`${m.name}: HTTP ${r.status}, aspects: ${names.join(', ')}`);
    m.aspects = names;
  }
  for (const path of ['assettypes', 'aspecttypes']) {
    const r = await get(`${AM}/${path}`, { size: 200 }, HAL);
    const text = JSON.stringify(r.body);
    const hits = new Set();
    for (const m of text.matchAll(/"name":"([^"]*(torque|weight|head|reject)[^"]*)"/gi)) {
      hits.add(m[1]);
    }
    say(`${path}: HTTP ${r.status}, ${text.length} characters, names with torque, weight,` +
      ` head or reject: ${hits.size ? [...hits].join('; ') : 'none'}`);
    saveSample(`shift_E_${path}.json`, r.body);
  }
  for (const m of machines.filter((x) => /carton|fill/i.test(x.name))) {
    for (const aspect of m.aspects || []) {
      const r = await get(`${TS}/${m.id}/${aspect}`, { limit: 1, sort: 'desc' });
      const rec = Array.isArray(r.body) ? r.body[0] : null;
      const vars = rec ? Object.keys(rec).filter((k) => k !== '_time' && !k.endsWith('_qc')) : [];
      say(`   ${m.name} / ${aspect}: HTTP ${r.status}, variables: ${vars.join(', ') || 'no record'}`);
    }
  }
});

await step('F', 'Comment text (7 days of B2 Line)', async () => {
  const to = window(DAY).to;
  const q = { from: iso(to - 7 * DAY_MS), to: iso(to), size: 5000, page: 0 };
  const r = await get(`${OEE}/assets/${line.id}/downtimeReasons`, q);
  const rows = rowsOf(r.body);
  const withComment = rows.filter((x) => Number(x.commentCount) > 0);
  say(`HTTP ${r.status}, ${rows.length} stops, ${withComment.length} with commentCount above 0`);
  const one = withComment[0];
  if (!one) {
    say('no stop with a comment in these 7 days: widen the window or ask the user for a day');
    return;
  }
  say(`stop: ${one.reason}, ${one.from} to ${one.to}, commentCount ${one.commentCount}`);
  const c = await get(`${OEE}/assets/${line.id}/comment`, { from: one.from, to: one.to });
  const list = Array.isArray(c.body) ? c.body : [];
  say(`/comment: HTTP ${c.status}, ${list.length} items, keys: ${list[0] ? Object.keys(list[0]) : '-'}`);
  saveSample('shift_F_comment.json', c.body);
});

// G is not part of the default run: node scripts/test-shift-report.js
// 2026-09-15 steps=G. Do the machines have their own calendar, product
// collection, shifts, products and orders (phase 2)?
await step('G', 'Config, calendar and filter values per machine', async () => {
  const w = window(DAY);
  const targets = [{ id: line.id, name: `${line.name} (line)` }, ...machines];
  const lineCal = {};
  for (const m of targets) {
    const c = await get(`${OEE}/assets/${m.id}/config`);
    const cfgBody = c.body || {};
    if (m.id === line.id) {
      lineCal.id = cfgBody.calendarId;
      lineCal.pc = cfgBody.productCollectionId;
    }
    say(`${m.name}: config HTTP ${c.status}, calendar ${cfgBody.calendarId ? (cfgBody.calendarId === lineCal.id ? 'same as the line' : 'OWN') : 'none'},` +
      ` product collection ${cfgBody.productCollectionId ? (cfgBody.productCollectionId === lineCal.pc ? 'same as the line' : 'OWN') : 'none'}`);
    if (cfgBody.calendarId) {
      const ev = await get(`${OEE}/calendars/${cfgBody.calendarId}/calendarEvents`, { from: iso(w.from), to: iso(w.to) });
      const events = (ev.body && ev.body.calendarEvents) || [];
      say(`   calendar events: HTTP ${ev.status}, ${events.length}, names ${[...new Set(events.map((e) => e.name))].join(', ')}`);
    }
    const fv = await get(`${OEE}/assets/${m.id}/filterValues`, { from: iso(w.from), to: iso(w.to) });
    const list = (fv.body && fv.body.filterValues) || [];
    const count = (key) => ((list.find((f) => f.key === key) || {}).value || []).length;
    say(`   filterValues: HTTP ${fv.status}, products ${count('product')}, orders ${count('order')}, shifts ${count('shift')}`);
    saveSample(`shift_G_${safe(m.name)}.json`, { config: cfgBody, filterValues: fv.body });
  }
});

mkdirSync('samples', { recursive: true });
writeFileSync('samples/shift-report-summary.txt', lines.join('\n') + '\n');
say('\nDone. Summary saved in samples/shift-report-summary.txt');
