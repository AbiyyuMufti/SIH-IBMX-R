// Cross-check for the BI report data items. GET calls, plus evaluateKPIs POSTs (already approved) with filter values.
// Prints only structure, counts and non-secret business names. Run: node scripts/test-report-coverage.js
import { cfg, getToken, apiGet, saveSample } from './lib-ih.js';
import { shape, mask } from './lib-probe.js';

const AM = '/api/assetmanagement/v3';
const HAL = { accept: 'application/hal+json' };
const tok = await getToken();
const t = tok.token;
const oee = cfg.oeePath;
const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();

// ---- A. hierarchy: OEE assets per site / area ----
const all = [];
for (let p = 0; p < 5; p++) {
  const r = await apiGet(`${AM}/assets`, t, { query: { size: 200, page: p }, ...HAL });
  all.push(...r.body._embedded.assets);
  if (p + 1 >= r.body.page.totalPages) break;
}
const byId = new Map(all.map((a) => [a.assetId, a]));
const oeeList = (await apiGet(`${oee}/assets`, t)).body;
const up = (a, suffix) => { for (let c = a; c; c = byId.get(c.parentId)) if (c.typeId.endsWith(suffix)) return c; return null; };
const rows = oeeList.map((o) => {
  const a = byId.get(o.assetId);
  const site = up(a, 'basicsite');
  const area = up(a, 'basicarea');
  const line = up(a, 'ProductionLine');
  return { ...o, site: site?.name ?? '(none)', area: area?.name ?? '(none)', line: line?.name ?? '(none)', type: a.typeId.split('.').pop() };
});
console.log('== A. OEE assets per site / area (44 total) ==');
const grp = {};
for (const r of rows) ((grp[r.site] ??= {})[r.area] ??= []).push(r.name);
for (const [s, areas] of Object.entries(grp)) {
  console.log(`${s}: ${Object.values(areas).flat().length} OEE assets`);
  for (const [a, names] of Object.entries(areas)) console.log(`   area ${a}: ${names.join(', ')}`);
}
console.log('asset type names of OEE assets:', [...new Set(rows.map((r) => r.type))].join(', '));

// ---- B. asset descriptions: do they carry baselines / targets? ----
console.log('\n== B. OEE asset descriptions ==');
const withDesc = oeeList.filter((a) => a.description);
const baseline = oeeList.filter((a) => /baseline/i.test(a.description || ''));
console.log('with description: %d of %d; mentioning "baseline": %d', withDesc.length, oeeList.length, baseline.length);
const pattern = (d) => d.replace(/\d[\d,.]*/g, '#').replace(/PLF#/g, 'PLF#').slice(0, 90);
console.log('description patterns:', [...new Set(baseline.map((a) => pattern(a.description)))].slice(0, 4).join(' || '));

// ---- C. downtime categories per site over 30 days ----
console.log('\n== C. downtime by top-level reason, last 30 days (topDowntimeReasons) ==');
const agg = {};
let noData = 0, errors = 0;
for (const r of rows) {
  const res = await apiGet(`${oee}/assets/${r.assetId}/topDowntimeReasons`, t, { query: { from: iso(now - 30 * 864e5), to: iso(now) } });
  if (res.status !== 200) { errors++; continue; }
  if (!res.body.length) { noData++; continue; }
  for (const x of res.body) {
    const top = (x.reasonFullPath || x.reason || '').split(' / ')[0] || '(blank)';
    const k = `${r.site} | ${top}`;
    const a = (agg[k] ??= { ms: 0, occ: 0, assets: new Set() });
    a.ms += Number(x.duration) || 0; a.occ += x.occurrence || 0; a.assets.add(r.name);
  }
}
console.log('assets with no downtime rows: %d, calls with errors: %d', noData, errors);
for (const [k, v] of Object.entries(agg).sort((a, b) => b[1].ms - a[1].ms).slice(0, 25)) console.log(`${k.padEnd(52)} ${(v.ms / 3.6e6).toFixed(1).padStart(8)} h  ${String(v.occ).padStart(6)} events  ${v.assets.size} assets`);
const names = new Set(Object.keys(agg).map((k) => k.split(' | ')[1]));
console.log('top-level reason names seen:', [...names].join(' ; '));
console.log('any "not logged"-like name:', [...names].filter((n) => /not logged|unlogged|unassigned|no reason|unknown/i.test(n)).join(', ') || 'none');

// ---- D. evaluateKPIs with filter values (GT4, 7 days) ----
console.log('\n== D. evaluateKPIs with SHIFT / PRODUCT filter values (GT4, 7 days) ==');
const gt4 = oeeList.find((a) => a.name === 'GT4');
const from = iso(now - 7 * 864e5), to = iso(now);
const fv = (await apiGet(`${oee}/assets/${gt4.assetId}/filterValues`, t, { query: { from, to } })).body.filterValues;
const val = (k) => fv.find((f) => f.key === k)?.value ?? [];
console.log('filterValues:', fv.map((f) => `${f.key}=${f.value.join('/')}`).join(' | '));
const evalKpi = async (label, filter) => {
  const res = await fetch(`${cfg.gateway}${oee}/expressions/evaluateKPIs`, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ assetId: gt4.assetId, scope: { from, to, filter, recursive: false, groupedByDateTime: false } }) });
  const j = await res.json().catch(() => ({}));
  const k = Object.fromEntries((j.results ?? []).filter((r) => r.expressionType === 'KPI').map((r) => [r.name, r.value]));
  console.log('%s -> HTTP %d | Good %s Total %s Theoretical %s OEE %s | missingMapping %s', label, res.status, k['Good parts'], k['Total parts'], k['Theoretical output'], k['OEE'], JSON.stringify(j.missingMapping)?.slice(0, 120));
  if (!res.ok) console.log('   body:', mask(JSON.stringify(j)).slice(0, 300));
  return j;
};
const E = (key, value) => ({ key, value });
await evalKpi('no filter           ', [E('PRODUCT', []), E('ORDER', []), E('SHIFT', [])]);
for (const s of val('shift')) await evalKpi(`SHIFT=${s.padEnd(10)}  `, [E('PRODUCT', []), E('ORDER', []), E('SHIFT', [s])]);
for (const p of val('product').slice(0, 2)) await evalKpi(`PRODUCT=${p.slice(0, 12)}`, [E('PRODUCT', [p]), E('ORDER', []), E('SHIFT', [])]);
for (const o of val('order').slice(0, 2)) await evalKpi(`ORDER=${o.padEnd(9)}   `, [E('PRODUCT', []), E('ORDER', [o]), E('SHIFT', [])]);

// ---- E/F/G. comments, shift calendar of B2 Line, products of B2 Line ----
console.log('\n== E. comments on B2 Line (7 days) ==');
const b2 = oeeList.find((a) => a.name === 'B2 Line');
const cm = await apiGet(`${oee}/assets/${b2.assetId}/comment`, t, { query: { from, to } });
console.log('HTTP %d, %s', cm.status, Array.isArray(cm.body) ? cm.body.length + ' items' : mask(JSON.stringify(cm.body)).slice(0, 200));

console.log('\n== F. shift calendar of B2 Line ==');
const b2cfg = (await apiGet(`${oee}/assets/${b2.assetId}/config`, t)).body;
const cal = (await apiGet(`${oee}/calendars/${b2cfg.calendarId}`, t)).body;
const ev = (await apiGet(`${oee}/calendars/${b2cfg.calendarId}/calendarEvents`, t, { query: { from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' } })).body.calendarEvents ?? [];
console.log('calendar:', cal.name, '| timeZoneText:', cal.timeZoneText, '| events:', ev.length);
for (const e of ev.slice(0, 8)) console.log('  ', e.name, '| duration h:', e.duration / 3.6e6, '| rrule:', JSON.stringify(e.rrule).slice(0, 140));

console.log('\n== G. products of B2 Line ==');
const pcs = (await apiGet(`${oee}/productCollections/${b2cfg.productCollectionId}/products`, t)).body.products ?? [];
console.log('products:', pcs.length, '| fields:', pcs[0] ? Object.keys(pcs[0]).join(', ') : '-');
for (const p of pcs.slice(0, 3)) console.log('  ', mask(JSON.stringify({ name: p.name, code: p.code, designSpeedValue: p.designSpeedValue, designSpeedUnit: p.designSpeedUnit, designSpeedInterval: p.designSpeedInterval, designSpeedType: p.designSpeedType })));
saveSample('report_coverage_hierarchy.json', { oeeAssetsBySite: Object.fromEntries(Object.entries(grp).map(([s, a]) => [s, Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.length]))])) });
