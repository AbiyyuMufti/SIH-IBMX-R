// Runs the VFC transformation logic for ONE production day with real read calls.
// Usage: node scripts/test-vfc-local.js 2026-09-30
import { getToken, apiGet, cfg } from './lib-ih.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sandbox = { module: { exports: {} } };
vm.runInNewContext(readFileSync(new URL('./vfc-transform.js', import.meta.url), 'utf8'), sandbox);
const T = sandbox.module.exports;

const day = process.argv[2] || '2026-09-30';
const fromMs = Date.parse(`${day}T06:00:00.000Z`), toMs = fromMs + 86400000;
const from = new Date(fromMs).toISOString(), to = new Date(toMs).toISOString();
const { token } = await getToken();
const PLANNED_ROOTS = ['Planned Downtime', 'Planned Maintenance'];

let all = [];
for (let p = 0; ; p++) {
  const r = await apiGet('/api/assetmanagement/v3/assets', token, { query: { size: 200, page: p }, accept: 'application/hal+json' });
  all = all.concat(r.body._embedded.assets);
  if (p + 1 >= r.body.page.totalPages) break;
}
const byId = Object.fromEntries(all.map((a) => [a.assetId, a]));
const oee = (await apiGet('/api/oee/v3/assets', token)).body;
const targets = oee.filter((o) => { const a = byId[o.assetId]; const t = a?.typeId.split('.').pop(); return (a.name === 'B2 Line' && t === 'ProductionLine') || (a.name === 'GT4' && t === 'GT4_Equipment'); });

const kpiRows = [], lossRows = [], unmapped = [], log = [];
const loadedAt = Date.now();
for (const o of targets) {
  const h = T.hierarchy(o.assetId, byId);
  const res = await fetch(cfg.gateway + '/api/oee/v3/expressions/evaluateKPIs', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ assetId: o.assetId, scope: { from, to, filter: [{ key: 'PRODUCT', value: [] }], recursive: false, groupedByDateTime: true } }),
  });
  const body = await res.json();
  if (res.status !== 200) { console.log('FAIL kpi', h.asset_name, res.status); continue; }
  const k = T.buildKpiRows(body, { assetId: o.assetId, isManual: o.isManual, h, loadMode: 'backfill', loadedAt, unmapped });
  let dr = [];
  for (let p = 0; ; p++) {
    const r = await apiGet(`/api/oee/v3/assets/${o.assetId}/downtimeReasons`, token, { query: { from, to, page: p, size: 300 } });
    dr = dr.concat(r.body._embedded?.downtimeReasons || []);
    if (p + 1 >= (r.body.page?.totalPages || 1)) break;
  }
  const l = T.buildLossRows(dr, { assetId: o.assetId, h, fromMs, toMs, plannedRoots: PLANNED_ROOTS, loadMode: 'backfill', loadedAt });
  console.log(`${h.asset_name}: kpi rows ${k.length}, loss rows ${l.length} (api rows ${dr.length}, dropped outside window ${l.droppedOutsideWindow}), hier ${JSON.stringify(h)}`);
  const sum = k.reduce((s, r) => s + (r.total_time_ms || 0), 0);
  console.log(`  SUM(total_time_ms) = ${sum} ms = ${(sum / 3600000).toFixed(3)} h`);
  const frac = {};
  for (const c of T.INT_COLUMNS.concat(T.DOUBLE_COLUMNS)) { const n = body.results.find((r) => T.KPI_COLUMNS[r.name] === c); if (n) { const f = n.groups.filter((g) => g.value !== null && !Number.isInteger(Number(g.value))).length; if (f) frac[c] = f; } }
  console.log('  int64 columns that had fractional hourly values (rounded):', JSON.stringify(frac));
  console.log('  loss_class counts:', JSON.stringify(l.reduce((m, r) => (m[r.loss_class] = (m[r.loss_class] || 0) + 1, m), {})), 'null values in kpi rows (oee/performance):', k.filter((r) => r.oee === null).length, k.filter((r) => r.performance === null).length);
  kpiRows.push(...k); lossRows.push(...l);
}
console.log('\nTOTAL fact_kpi rows', kpiRows.length, '| fact_loss rows', lossRows.length, '| KPI names without a column:', JSON.stringify(unmapped));
const show = (rows, n, pick) => rows.slice(0, n).forEach((r) => console.log(JSON.stringify(pick ? Object.fromEntries(pick.map((c) => [c, r[c]])) : r)));
console.log('\nfact_kpi samples (B2 Line first 3 hours, GT4 first 2):');
show(kpiRows.filter((r) => r.asset_name === 'B2 Line').slice(0, 3).concat(kpiRows.filter((r) => r.asset_name === 'GT4').slice(0, 2)), 5);
console.log('\nfact_loss samples:');
show(lossRows.filter((r) => r.asset_name === 'B2 Line').slice(0, 4).concat(lossRows.filter((r) => r.asset_name === 'GT4').slice(0, 1)), 5);
