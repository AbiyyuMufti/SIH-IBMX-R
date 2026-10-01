// Phase B (GET only after token): build the asset hierarchy from the Asset Management API
// and mark which nodes are also OEE assets. Prints names and structure; saves one redacted sample page.
// Run: node scripts/test-asset-tree.js
import { cfg, getToken, apiGet, saveSample } from './lib-ih.js';

const shape = (v, depth = 0) => {
  if (Array.isArray(v)) return `array(${v.length})` + (v.length && depth < 2 ? ` of ${shape(v[0], depth + 1)}` : '');
  if (v && typeof v === 'object') return depth >= 2 ? 'object' : '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${shape(x, depth + 1)}`).join(', ') + ' }';
  return v === null ? 'null' : typeof v;
};
const AM = '/api/assetmanagement/v3';
const HAL = { accept: 'application/hal+json' }; // Asset Management rejects Accept: application/json with HTTP 500
const tok = await getToken();

// OEE assets, to mark them in the tree
const oee = await apiGet(`${cfg.oeePath}/assets`, tok.token);
const oeeIds = new Set((Array.isArray(oee.body) ? oee.body : []).map((a) => a.assetId));

// root
const root = await apiGet(`${AM}/assets/root`, tok.token, HAL);
console.log('GET %s/assets/root -> HTTP %d, shape: %s', AM, root.status, shape(root.body));

// all assets, paged
const assets = [];
let page = 0, totalPages = 1, first;
do {
  const r = await apiGet(`${AM}/assets`, tok.token, { query: { size: 200, page }, ...HAL });
  if (page === 0) {
    first = r;
    console.log('GET %s/assets?size=200&page=0 -> HTTP %d in %dms', AM, r.status, r.ms);
    console.log('top-level shape:', shape(r.body));
    console.log('page info:', JSON.stringify(r.body?.page));
    console.log('item fields:', Object.keys(r.body?._embedded?.assets?.[0] ?? {}).join(', '));
  }
  if (r.status !== 200) { console.log('page %d -> HTTP %d: %s', page, r.status, JSON.stringify(r.body).slice(0, 300)); break; }
  assets.push(...(r.body._embedded?.assets ?? []));
  totalPages = r.body.page?.totalPages ?? 1;
  page++;
} while (page < totalPages && page < 20);
console.log('fetched %d assets in %d page(s); %d of them are OEE assets', assets.length, page, assets.filter((a) => oeeIds.has(a.assetId)).length);
if (first) saveSample('am_assets_page0.json', { request: `GET ${AM}/assets?size=200&page=0`, status: first.status, headers: first.headers, body: first.body });

// tree
const byId = new Map(assets.map((a) => [a.assetId, a]));
const kids = new Map();
for (const a of assets) (kids.get(a.parentId ?? 'ROOT') ?? kids.set(a.parentId ?? 'ROOT', []).get(a.parentId ?? 'ROOT')).push(a);
for (const l of kids.values()) l.sort((x, y) => x.name.localeCompare(y.name));
const tops = assets.filter((a) => !a.parentId || !byId.has(a.parentId));
const mark = (a) => `${a.name}${oeeIds.has(a.assetId) ? ' [OEE]' : ''}`;
const print = (a, depth, maxDepth, prefix = '') => {
  console.log(`${'  '.repeat(depth)}${mark(a)}  (${a.typeId?.split('.').pop() ?? '?'}${kids.get(a.assetId)?.length ? ', ' + kids.get(a.assetId).length + ' children' : ''})`);
  if (depth < maxDepth) for (const c of kids.get(a.assetId) ?? []) print(c, depth + 1, maxDepth);
};
console.log('\n== top of the tree (3 levels) ==');
for (const t of tops) print(t, 0, 3);

const focus = (name) => assets.filter((a) => a.name.trim().toLowerCase() === name.toLowerCase());
for (const n of ['Hull', 'B2 Line', 'GT4']) {
  const hits = focus(n);
  console.log('\n== %s: %d match(es) ==', n, hits.length);
  for (const h of hits) {
    const path = [];
    for (let c = h; c; c = byId.get(c.parentId)) path.unshift(c.name);
    console.log('assetId=%s path=%s', h.assetId, path.join(' > '));
    print(h, 0, 3);
  }
}
