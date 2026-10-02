// Probe for the VFC flow: one production day on B2 Line and GT4. Read calls only, plus the
// read-style evaluateKPIs POST (approved earlier). Saves raw redacted responses to samples/vfc_*.
// Usage: node scripts/test-vfc-probe.js 2026-09-30
import { getToken, apiGet, cfg, saveSample } from './lib-ih.js';
import { writeFileSync } from 'node:fs';

const day = process.argv[2] || '2026-09-30';
const from = `${day}T06:00:00.000Z`;
const to = new Date(Date.parse(from) + 86400000).toISOString();
const { token } = await getToken();

async function post(path, body) {
  const res = await fetch(cfg.gateway + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let b; try { b = JSON.parse(text); } catch { b = text; }
  return { status: res.status, body: b };
}

// hierarchy
let all = [];
for (let p = 0; ; p++) {
  const r = await apiGet('/api/assetmanagement/v3/assets', token, { query: { size: 200, page: p }, accept: 'application/hal+json' });
  all = all.concat(r.body._embedded.assets);
  if (p + 1 >= r.body.page.totalPages) break;
}
const oee = (await apiGet('/api/oee/v3/assets', token)).body;
const hull = all.find((a) => a.name === 'Hull' && a.typeId.endsWith('basicsite'));
const oeeIds = new Set(oee.map((a) => a.assetId));
const pick = all.filter((a) => oeeIds.has(a.assetId) && ((a.name === 'B2 Line' && a.typeId.endsWith('ProductionLine')) || (a.name === 'GT4' && a.typeId.endsWith('GT4_Equipment'))));
console.log('picked', pick.map((a) => `${a.name}/${a.typeId.split('.').pop()}`), 'hull?', !!hull);

const out = {};
for (const a of pick) {
  const k = await post('/api/oee/v3/expressions/evaluateKPIs', {
    assetId: a.assetId,
    scope: { from, to, filter: [], recursive: false, groupedByDateTime: true },
  });
  const rows = k.body.results || [];
  console.log(a.name, 'evaluateKPIs', k.status, 'results', rows.length, 'withGroups', rows.filter((r) => Array.isArray(r.groups)).length,
    'groups(first)', rows[0]?.groups?.length, 'keys', rows[0] && Object.keys(rows[0]).join(','), 'productUnit', k.body.productUnit, 'missing', JSON.stringify(k.body.missingMapping));
  let dr = [];
  for (let p = 0; ; p++) {
    const r = await apiGet(`/api/oee/v3/assets/${a.assetId}/downtimeReasons`, token, { query: { from, to, page: p, size: 300 } });
    if (r.status !== 200) { console.log('downtime', r.status, JSON.stringify(r.body).slice(0, 200)); break; }
    dr = dr.concat(r.body._embedded?.downtimeReasons || []);
    if (p + 1 >= (r.body.page?.totalPages || 1)) break;
  }
  console.log(a.name, 'downtimeReasons rows', dr.length);
  out[a.name] = { kpi: k, downtime: dr };
  saveSample(`vfc_${a.name.replace(/\W/g, '_')}_${day}.json`, out[a.name]);
}
