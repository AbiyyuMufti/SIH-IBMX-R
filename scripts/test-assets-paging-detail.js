// Phase B (GET only after token): OEE /assets paging, then /assets/{id} and /assets/{id}/config
// for a few named assets. Prints structure and non-secret metadata; saves redacted samples.
// Run: node scripts/test-assets-paging-detail.js [name1 name2 ...]   (default: B2 Line, GT4, 02 Filler, Hull)
import { cfg, getToken, apiGet, saveSample } from './lib-ih.js';

const shape = (v, depth = 0) => {
  if (Array.isArray(v)) return `array(${v.length})` + (v.length && depth < 3 ? ` of ${shape(v[0], depth + 1)}` : '');
  if (v && typeof v === 'object') {
    if (depth >= 3) return 'object';
    return '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${shape(x, depth + 1)}`).join(', ') + ' }';
  }
  return v === null ? 'null' : typeof v;
};
const short = (b) => (typeof b === 'string' ? JSON.stringify(b.slice(0, 200)) : shape(b).slice(0, 900));

const tok = await getToken();
const oee = cfg.oeePath;

// ---- all assets (default) ----
const all = await apiGet(`${oee}/assets`, tok.token);
const list = Array.isArray(all.body) ? all.body : [];
console.log('GET /assets -> %d, %d items', all.status, list.length);
console.log('All names:', list.map((a) => a.name).join(' | '));

// ---- paging experiments ----
console.log('\n== paging ==');
for (const q of [{ size: 5 }, { size: 5, page: 0 }, { size: 5, page: 1 }, { size: 5, page: 2 }, { page: 1 }]) {
  const r = await apiGet(`${oee}/assets`, tok.token, { query: q });
  const items = Array.isArray(r.body) ? r.body : [];
  console.log('query %s -> HTTP %d, %s items, first=%s, extra headers=%s', JSON.stringify(q), r.status, Array.isArray(r.body) ? items.length : 'non-array', items[0]?.name ?? '-', JSON.stringify(r.headers));
  if (!Array.isArray(r.body)) console.log('   body:', short(r.body));
}

// ---- named assets ----
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['B2 Line', 'GT4', '02 Filler', 'Hull'];
console.log('\n== named assets ==');
for (const name of wanted) {
  const hit = list.find((a) => a.name.trim().toLowerCase() === name.toLowerCase());
  if (!hit) {
    console.log('%s: NOT in the OEE asset list (%s)', name, list.filter((a) => a.name.toLowerCase().includes(name.toLowerCase())).map((a) => a.name).join(', ') || 'no partial match');
    continue;
  }
  console.log('\n%s: assetId=%s isManual=%s isConfigured=%s', hit.name, hit.assetId, hit.isManual, hit.isConfigured);
  const slug = hit.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  for (const [label, path] of [['asset', `${oee}/assets/${hit.assetId}`], ['config', `${oee}/assets/${hit.assetId}/config`]]) {
    const r = await apiGet(path, tok.token);
    console.log('  GET /assets/{id}%s -> HTTP %d in %dms, shape: %s', label === 'config' ? '/config' : '', r.status, r.ms, short(r.body));
    saveSample(`oee_${label}_${slug}.json`, { request: `GET ${path.replace(hit.assetId, '{assetId}')}`, status: r.status, headers: r.headers, body: r.body });
  }
}
