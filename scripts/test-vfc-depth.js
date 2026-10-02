// How far back does data go? Probes one production day at several offsets (read calls + read-style KPI POST).
import { getToken, apiGet, cfg } from './lib-ih.js';
const { token } = await getToken();
const assets = { 'B2 Line': 'cf4565d7da1e4efcbc0ea6a4814b8eee', GT4: 'bc08dae161124f1cb533199f556190b3' };
const base = Date.parse('2026-10-02T06:00:00.000Z');
for (const [name, id] of Object.entries(assets)) {
  for (const d of (process.argv[2] ? process.argv[2].split(',').map(Number) : [3, 7, 14, 30])) {
    const f = new Date(base - d * 86400000).toISOString(), t = new Date(base - (d - 1) * 86400000).toISOString();
    const res = await fetch(cfg.gateway + '/api/oee/v3/expressions/evaluateKPIs', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId: id, scope: { from: f, to: t, filter: [], recursive: false, groupedByDateTime: false } }) });
    const b = await res.json().catch(() => ({}));
    const g = (n) => (b.results || []).find((r) => r.name === n)?.value;
    const dr = await apiGet(`/api/oee/v3/assets/${id}/downtimeReasons`, token, { query: { from: f, to: t, size: 300 } });
    console.log(name, `-${d}d`, f.slice(0, 10), 'http', res.status, 'Total parts', g('Total parts'), 'Total time h', g('Total time') / 3600000, 'stops', dr.body?.page?.totalElements, res.status !== 200 ? JSON.stringify(b).slice(0, 150) : '');
  }
}
