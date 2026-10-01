// Phase B group 6: KPI calculation POST (approved by the user, same call Paul-Flow uses).
// POST /api/oee/v3/expressions/evaluateKPIs   body = { assetId, scope: { from, to, filter, recursive, groupedByDateTime } }
// The call asks the OEE app to calculate KPIs for a period; the flows only read the result.
// Run: node scripts/test-kpi-post.js
import { cfg, getToken, apiGet, saveSample } from './lib-ih.js';
import { shape, mask } from './lib-probe.js';

const tok = await getToken();
const oee = cfg.oeePath;
const assets = (await apiGet(`${oee}/assets`, tok.token)).body;
const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();

async function evaluate(name, hours, recursive) {
  const a = assets.find((x) => x.name === name);
  const body = {
    assetId: a.assetId,
    scope: {
      from: iso(now - hours * 3600e3),
      to: iso(now),
      filter: [{ key: 'PRODUCT', value: [] }, { key: 'ORDER', value: [] }, { key: 'SHIFT', value: [] }],
      recursive,
      groupedByDateTime: false,
    },
  };
  const t0 = Date.now();
  const res = await fetch(`${cfg.gateway}${oee}/expressions/evaluateKPIs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  console.log('\nPOST evaluateKPIs %s, last %dh, recursive=%s -> HTTP %d in %dms', name, hours, recursive, res.status, Date.now() - t0);
  console.log('   shape:', mask(shape(json, 0, 3)).slice(0, 700));
  const results = Array.isArray(json) ? json : json?.results ?? json?.payload?.results ?? [];
  console.log('   results:', Array.isArray(results) ? results.length : 'n/a');
  if (Array.isArray(results) && results.length) {
    console.log('   fields of one result:', Object.keys(results[0]).join(', '));
    for (const r of results) console.log('   ', mask(JSON.stringify(r)).replace(/[0-9a-f]{32}/g, '<id>').slice(0, 220));
  } else console.log('   body:', mask(typeof json === 'string' ? json : JSON.stringify(json)).slice(0, 500));
  saveSample(`oee_evaluateKPIs_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}${recursive ? '_recursive' : ''}.json`, { request: `POST ${oee}/expressions/evaluateKPIs (${hours}h, recursive=${recursive})`, requestBody: { assetId: '{assetId}', scope: { ...body.scope, from: '<from>', to: '<to>' } }, status: res.status, body: json });
}

await evaluate('B2 Line', 24, false);
await evaluate('GT4', 48, false);
await evaluate('B2 Line', 24, true); // does recursive roll up the 7 child machines?
