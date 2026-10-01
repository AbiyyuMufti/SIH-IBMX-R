// Phase B: GET /version (with and without token) and GET /assets (default paging).
// GET only after the token POST. Prints structure and non-secret metadata; saves redacted samples.
// Run: node scripts/test-version-assets.js
import { cfg, getToken, apiGet, saveSample } from './lib-ih.js';

const shape = (v, depth = 0) => {
  if (Array.isArray(v)) return `array(${v.length})` + (v.length && depth < 2 ? ` of ${shape(v[0], depth + 1)}` : '');
  if (v && typeof v === 'object') {
    if (depth >= 2) return 'object';
    return '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${shape(x, depth + 1)}`).join(', ') + ' }';
  }
  return v === null ? 'null' : typeof v;
};

const tok = await getToken();
console.log('Token OK (fields: %s)', tok.fields.join(', '));

// --- /version, with token ---
const v = await apiGet(`${cfg.oeePath}/version`, tok.token);
console.log('\nGET /version (with token) -> HTTP %d in %dms', v.status, v.ms);
console.log('headers:', JSON.stringify(v.headers));
console.log('body   :', typeof v.body === 'string' ? JSON.stringify(v.body.slice(0, 300)) : JSON.stringify(v.body));
console.log('saved  :', saveSample('oee_version.json', { request: `GET ${cfg.oeePath}/version`, status: v.status, headers: v.headers, body: v.body }).replace(/.*samples/, 'samples'));

// --- /version, without token (Postman marks it as no auth) ---
const vn = await fetch(cfg.gateway + `${cfg.oeePath}/version`, { headers: { Accept: 'application/json' } });
console.log('GET /version (NO token)   -> HTTP %d', vn.status);

// --- /assets, default paging ---
const a = await apiGet(`${cfg.oeePath}/assets`, tok.token);
console.log('\nGET /assets -> HTTP %d in %dms', a.status, a.ms);
console.log('headers:', JSON.stringify(a.headers));
console.log('body shape:', shape(a.body));

const body = a.body && typeof a.body === 'object' ? a.body : {};
const list = Array.isArray(body) ? body : body._embedded ? Object.values(body._embedded)[0] : body.assets ?? body.items ?? body.content ?? [];
console.log('items on this page:', Array.isArray(list) ? list.length : 'n/a');
if (Array.isArray(list) && list.length) {
  console.log('first item fields:', Object.keys(list[0]).join(', '));
  console.log('\nid | name | type (first 15)');
  for (const it of list.slice(0, 15)) console.log([it.id ?? it.assetId, it.name, it.typeId ?? it.type].join(' | '));
}
for (const k of ['page', 'paging', 'pagination', '_links', 'links']) if (body[k] !== undefined) console.log(`${k}:`, JSON.stringify(body[k]).slice(0, 400));
console.log('\nsaved  :', saveSample('oee_assets.json', { request: `GET ${cfg.oeePath}/assets`, status: a.status, headers: a.headers, body: a.body }).replace(/.*samples/, 'samples'));
