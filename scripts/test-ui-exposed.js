// Checks that what the OEE UI shows (KPI targets, product collection with design speed, operator entries) is exposed by the API.
// Read calls only. Usage: node scripts/test-ui-exposed.js
import { getToken, apiGet, saveSample } from './lib-ih.js';
const { token } = await getToken();
const get = async (p, q) => { const r = await apiGet(p, token, { query: q }); if (r.status !== 200) throw new Error(p + ' HTTP ' + r.status); return r.body; };

const oee = await get('/api/oee/v3/assets');
console.log('OEE assets:', oee.length);

// 1. KPI targets (warning / error) per asset
const sets = new Map();
let gt4 = null, gt4cfg = null;
for (const a of oee) {
  const r = await apiGet(`/api/oee/v3/assets/${a.assetId}`, token);
  if (r.status !== 200) { sets.set('HTTP ' + r.status, [...(sets.get('HTTP ' + r.status) || []), a.name]); continue; }
  const t = r.body.thresholds || {};
  const key = ['OEE', 'Performance', 'Availability', 'Quality'].map((k) => `${k} ${(t.warnings || []).find((x) => x.name === k)?.value ?? '-'}/${(t.errors || []).find((x) => x.name === k)?.value ?? '-'}`).join(' | ');
  sets.set(key, [...(sets.get(key) || []), a.name]);
  if (a.name === 'GT4' && /GT4/.test(a.description || a.name) && !gt4) gt4 = a;
}
console.log('\n1) KPI targets warning/error, grouped by value set:');
for (const [k, v] of sets) console.log(` ${v.length} asset(s): ${k}\n    e.g. ${v.slice(0, 5).join(', ')}`);

// 2. product collections
const cols = (await get('/api/oee/v3/productCollections')).productCollections;
console.log('\n2) product collections:', cols.length);
const sp4 = cols.find((c) => c.name === 'SP4 Products');
console.log(' "SP4 Products" collection exists:', !!sp4, sp4 ? '| description: ' + sp4.description : '');
if (sp4) {
  const p = (await get(`/api/oee/v3/productCollections/${sp4.id}/products`)).products;
  console.log(' products in SP4:', p.length, '\n first 3:', JSON.stringify(p.slice(0, 3)));
  saveSample('oee_products_sp4.json', p.slice(0, 5));
  // which assets use this collection?
  const users = [];
  for (const a of oee) { const r = await apiGet(`/api/oee/v3/assets/${a.assetId}/productCollection`, token); if (r.status === 200 && r.body.productCollectionId === sp4.id) users.push(a.name); }
  console.log(' assets using SP4 Products:', users.join(', ') || 'none');
}

// 3. GT4 operator entries, as in the third screenshot
const gt4All = oee.filter((a) => a.name === 'GT4');
for (const a of gt4All) {
  const mi = await apiGet(`/api/oee/v3/assets/${a.assetId}/manualInputs`, token, { query: { from: '2026-09-08T00:00:00.000Z', to: '2026-09-14T00:00:00.000Z' } });
  const n = mi.body?.manualInputs?.length ?? 0;
  console.log(`\n3) GT4 candidate (${a.assetId.slice(0, 4)}…) manualInputs HTTP ${mi.status}, entries ${n}, virtualPeriods ${mi.body?.virtualPeriods?.length}`);
  if (n) {
    console.log(' keys of one entry:', Object.keys(mi.body.manualInputs[0]).join(', '));
    for (const m of mi.body.manualInputs.slice(0, 4)) console.log(' ', JSON.stringify(m).replace(/"[0-9a-f]{32}"/g, '"<id>"').slice(0, 520));
    saveSample('oee_manualinputs_gt4_sep.json', mi.body);
  }
}
