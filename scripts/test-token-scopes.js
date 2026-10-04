// Prints the scope names inside the access token (names only, never the token itself) and the data lake error body.
import { cfg, getToken } from './lib-ih.js';
const { token } = await getToken();
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
const scopes = payload.scope || [];
console.log('token claims:', Object.keys(payload).join(', '));
console.log('scope count:', scopes.length);
console.log('scopes with "lake" or "mdl" or "datalake":', scopes.filter((s) => /lake|mdl|object/i.test(s)).join(', ') || 'none');
console.log('all scope prefixes:', [...new Set(scopes.map((s) => String(s).split('.').slice(0, 2).join('.')))].join(', '));
for (const k of ['roles', 'authorities', 'ten', 'client_id']) {
  if (payload[k] !== undefined && k !== 'client_id' && k !== 'ten') console.log(k + ':', JSON.stringify(payload[k]).slice(0, 300));
}
const res = await fetch(cfg.gateway + '/api/datalake/v3/generateDownloadObjectUrls', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ paths: [{ path: 'fact_loss/site=Hull/fact_loss_2026-09-09.parquet' }] })
});
console.log('data lake POST HTTP', res.status, (await res.text()).slice(0, 300));
