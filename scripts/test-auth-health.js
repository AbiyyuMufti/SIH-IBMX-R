// Phase B step 6: test auth with the reckitt API technical user, then ONE GET.
// 1) POST token (client credentials)   2) GET {gateway}{oeePath}/health
// Prints status codes and non-secret metadata only. Run: node scripts/test-auth-health.js
import { cfg, getToken, apiGet, saveSample } from './lib-ih.js';

console.log('Token URL host :', new URL(cfg.tokenUrl).host);
console.log('Gateway        :', cfg.gateway);

let tok;
try {
  tok = await getToken();
} catch (e) {
  console.error('AUTH FAILED:', e.message);
  process.exit(1);
}
console.log('Token OK       : type=%s expires_in=%ss length=%d (value not printed)', tok.tokenType, tok.expiresIn, tok.token.length);
console.log('Token response fields:', tok.fields.join(', '));

const r = await apiGet(`${cfg.oeePath}/health`, tok.token);
console.log('GET %s -> HTTP %d in %dms', r.url.replace(cfg.gateway, ''), r.status, r.ms);
console.log('Response headers (selected):', JSON.stringify(r.headers));
console.log('Response body:', typeof r.body === 'string' ? r.body.slice(0, 500) : JSON.stringify(r.body, null, 2).slice(0, 1500));

const file = saveSample('oee_health.json', { request: `GET ${cfg.oeePath}/health`, status: r.status, headers: r.headers, body: r.body });
console.log('Saved redacted sample:', file.replace(/.*samples/, 'samples'));
