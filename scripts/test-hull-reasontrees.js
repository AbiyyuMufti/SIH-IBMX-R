// Phase B (GET only after token): what exists at site level (Hull) and what reason trees are.
// Run: node scripts/test-hull-reasontrees.js
import { cfg, getToken, apiGet, saveSample } from './lib-ih.js';

const shape = (v, depth = 0, max = 3) => {
  if (Array.isArray(v)) return `array(${v.length})` + (v.length && depth < max ? ` of ${shape(v[0], depth + 1, max)}` : '');
  if (v && typeof v === 'object') return depth >= max ? 'object' : '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${shape(x, depth + 1, max)}`).join(', ') + ' }';
  return v === null ? 'null' : typeof v;
};
const AM = '/api/assetmanagement/v3';
const HAL = { accept: 'application/hal+json' };
const oee = cfg.oeePath;
const tok = await getToken();
const call = async (label, path, opts) => {
  const r = await apiGet(path, tok.token, opts);
  console.log('%s -> HTTP %d in %dms', label, r.status, r.ms);
  return r;
};

// find Hull and B2 Line / GT4 in Asset Management
const all = [];
for (let p = 0; p < 5; p++) {
  const r = await apiGet(`${AM}/assets`, tok.token, { query: { size: 200, page: p }, ...HAL });
  all.push(...(r.body._embedded?.assets ?? []));
  if (p + 1 >= (r.body.page?.totalPages ?? 1)) break;
}
const hull = all.find((a) => a.name === 'Hull');
const b2 = all.find((a) => a.name === 'B2 Line');
console.log('Hull id=%s  B2 Line id=%s', hull.assetId, b2.assetId);

console.log('\n== Hull (a site) ==');
let r = await call('OEE GET /assets/{hull}', `${oee}/assets/${hull.assetId}`);
console.log('   body:', JSON.stringify(r.body).slice(0, 300));
r = await call('OEE GET /assets/{hull}/config', `${oee}/assets/${hull.assetId}/config`);
console.log('   body:', JSON.stringify(r.body).slice(0, 300));
r = await call('AM  GET /assets/{hull}', `${AM}/assets/${hull.assetId}`, HAL);
console.log('   shape:', shape(r.body, 0, 2).slice(0, 700));
saveSample('am_asset_hull.json', { request: `GET ${AM}/assets/{assetId}`, status: r.status, headers: r.headers, body: r.body });
const kidsFilter = JSON.stringify({ parentId: hull.assetId });
r = await call('AM  GET /assets?filter={parentId}', `${AM}/assets`, { query: { filter: kidsFilter, size: 50 }, ...HAL });
console.log('   children via filter:', (r.body._embedded?.assets ?? []).map((a) => a.name).join(', ') || JSON.stringify(r.body).slice(0, 200));
r = await call('AM  GET /assets/{hull}/aspects', `${AM}/assets/${hull.assetId}/aspects`, HAL);
console.log('   shape:', shape(r.body, 0, 2).slice(0, 300));

console.log('\n== B2 Line (OEE line) ==');
r = await call('AM  GET /assets/{b2}/aspects', `${AM}/assets/${b2.assetId}/aspects`, HAL);
console.log('   shape:', shape(r.body, 0, 2).slice(0, 400));
r = await call('OEE GET /assets/{b2}', `${oee}/assets/${b2.assetId}`);
console.log('   thresholds sample (first warning):', JSON.stringify(r.body.thresholds?.warnings?.[0]), '| first error:', JSON.stringify(r.body.thresholds?.errors?.[0]));

console.log('\n== reason trees ==');
const rt = await call('OEE GET /reasontrees', `${oee}/reasontrees`);
const trees = Array.isArray(rt.body) ? rt.body : [];
console.log('   shape:', shape(rt.body, 0, 2).slice(0, 400), '| count:', trees.length);
for (const t of trees.slice(0, 10)) console.log('   tree:', JSON.stringify({ ...t, reasons: undefined }).slice(0, 200));
saveSample('oee_reasontrees.json', { request: `GET ${oee}/reasontrees`, status: rt.status, headers: rt.headers, body: rt.body });

const oeeList = (await apiGet(`${oee}/assets`, tok.token)).body;
const b2Oee = oeeList.find((a) => a.assetId === b2.assetId);
console.log('B2 Line reasonTreeId:', b2Oee.reasonTreeId ? 'present' : 'missing');
const treeId = b2Oee.reasonTreeId || trees[0]?.id || trees[0]?.reasonTreeId;
if (treeId) {
  r = await call('OEE GET /reasontrees/{id}', `${oee}/reasontrees/${treeId}`);
  console.log('   shape:', shape(r.body, 0, 2).slice(0, 500));
  const rs = await call('OEE GET /reasontrees/{id}/reasons', `${oee}/reasontrees/${treeId}/reasons`);
  const reasons = Array.isArray(rs.body) ? rs.body : rs.body?.reasons ?? rs.body?.items ?? [];
  console.log('   shape:', shape(rs.body, 0, 3).slice(0, 700));
  console.log('   reasons: %d', reasons.length);
  const walk = (list, d = 0) => { for (const x of list.slice(0, 8)) { console.log('   ' + '  '.repeat(d) + (x.name ?? x.reason ?? JSON.stringify(x).slice(0, 60)) + (x.type || x.state ? ` [${x.type ?? x.state}]` : '')); if (d < 2 && Array.isArray(x.children ?? x.reasons)) walk(x.children ?? x.reasons, d + 1); } };
  walk(reasons);
  saveSample('oee_reasontree_reasons.json', { request: `GET ${oee}/reasontrees/{id}/reasons`, status: rs.status, headers: rs.headers, body: rs.body });
}
