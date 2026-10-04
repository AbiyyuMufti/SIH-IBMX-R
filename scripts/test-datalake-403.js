// Shows only the error body of generateDownloadObjectUrls (no URLs, no token). Read-style POST, user approved.
import { cfg, getToken } from './lib-ih.js';
const { token } = await getToken();
for (const path of ['mufti_test/fact_kpi/Hull/fact_kpi_2026-09-09.parquet']) {
  const res = await fetch(cfg.gateway + '/api/datalake/v3/generateDownloadObjectUrls', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ paths: [{ path }] })
  });
  console.log('HTTP', res.status, (await res.text()).slice(0, 400));
}
// other data lake endpoints, GET only, to see whether the user has any data lake right
for (const p of ['/api/datalake/v3/objects', '/api/datalake/v3/objectEventSubscriptions', '/api/datalake/v3/dataLakes']) {
  const r = await fetch(cfg.gateway + p, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  console.log('GET', p, 'HTTP', r.status, (await r.text()).slice(0, 160));
}
