// Phase B: the two remaining read-style POSTs (approved by the user together with evaluateKPIs).
//  1) POST /api/oee/v3/expressions/{expressionId}/evaluate   (one expression, optionally per time bucket)
//  2) POST /api/oee/v3/assets/{assetId}/timeModelCategoryDistribution
// Run: node scripts/test-kpi-post2.js
import { cfg, getToken, apiGet, saveSample } from './lib-ih.js';
import { shape, mask } from './lib-probe.js';

const tok = await getToken();
const oee = cfg.oeePath;
const assets = (await apiGet(`${oee}/assets`, tok.token)).body;
const exprs = (await apiGet(`${oee}/expressions`, tok.token)).body.expressions;
const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();
const FILTER = [{ key: 'PRODUCT', value: [] }, { key: 'ORDER', value: [] }];

async function post(label, path, body, sample) {
  const t0 = Date.now();
  const res = await fetch(`${cfg.gateway}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  console.log('\n%s -> HTTP %d in %dms', label, res.status, Date.now() - t0);
  console.log('   shape:', mask(shape(json, 0, 3)).slice(0, 800));
  saveSample(sample, { request: `POST ${path.replace(/[0-9a-f]{32}/g, '{id}')}`, requestBody: JSON.parse(JSON.stringify(body, (k, v) => (k === 'assetId' ? '{assetId}' : v))), status: res.status, body: json });
  return { status: res.status, json };
}

// ---------- 1) expressions/{id}/evaluate ----------
const b2 = assets.find((a) => a.name === 'B2 Line');
const idOf = (name, type = 'KPI') => exprs.find((e) => e.name === name && e.type === type).id;
const scope = (hours, extra = {}) => ({ from: iso(now - hours * 3600e3), to: iso(now), filter: FILTER, recursive: false, groupedByDateTime: false, ...extra });

console.log('== POST /expressions/{id}/evaluate (B2 Line) ==');
let r = await post('OEE, 24h, grouped=false', `${oee}/expressions/${idOf('OEE')}/evaluate`, { assetId: b2.assetId, scope: scope(24) }, 'oee_evaluate_oee.json');
console.log('   json:', mask(JSON.stringify(r.json)).slice(0, 700));

r = await post('OEE, 6h, groupedByDateTime=true', `${oee}/expressions/${idOf('OEE')}/evaluate`, { assetId: b2.assetId, scope: scope(6, { groupedByDateTime: true }) }, 'oee_evaluate_oee_grouped.json');
const grp = r.json?.results ?? r.json?.result ?? r.json;
console.log('   json (start):', mask(JSON.stringify(r.json)).slice(0, 900));

r = await post('Availability, 24h, recursive=true', `${oee}/expressions/${idOf('Availability')}/evaluate`, { assetId: b2.assetId, scope: scope(24, { recursive: true }) }, 'oee_evaluate_availability_recursive.json');
console.log('   json:', mask(JSON.stringify(r.json)).slice(0, 700));

r = await post('Total parts Aux (AUXILIARY), 24h', `${oee}/expressions/${idOf('Total parts Aux', 'AUXILIARY')}/evaluate`, { assetId: b2.assetId, scope: scope(24) }, 'oee_evaluate_aux.json');
console.log('   json:', mask(JSON.stringify(r.json)).slice(0, 500));

// ---------- 2) timeModelCategoryDistribution ----------
console.log('\n== POST /assets/{id}/timeModelCategoryDistribution ==');
for (const [name, hours, force] of [['B2 Line', 24, undefined], ['B2 Line', 24, true], ['GT4', 48, true]]) {
  const a = assets.find((x) => x.name === name);
  const body = { from: iso(now - hours * 3600e3), to: iso(now), filter: FILTER, ...(force !== undefined ? { force } : {}) };
  const rr = await post(`${name}, ${hours}h, force=${force}`, `${oee}/assets/${a.assetId}/timeModelCategoryDistribution`, body, `oee_timeModelCategoryDistribution_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}${force ? '_force' : ''}.json`);
  console.log('   json:', mask(JSON.stringify(rr.json)).replace(/[0-9a-f]{32}/g, '<id>').slice(0, 900));
}
