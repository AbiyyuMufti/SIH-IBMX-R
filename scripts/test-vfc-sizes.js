import { getToken, apiGet } from './lib-ih.js';
const { token } = await getToken();
const id = 'cf4565d7da1e4efcbc0ea6a4814b8eee';
for (const [f, t] of [['2026-09-25T06:00:00.000Z', '2026-09-26T06:00:00.000Z']]) {
  for (const size of [25, 300, 1000, 5000]) {
    const r = await apiGet(`/api/oee/v3/assets/${id}/downtimeReasons`, token, { query: { from: f, to: t, size, page: 0 } });
    console.log('size', size, r.status, 'rows', r.body._embedded?.downtimeReasons?.length, JSON.stringify(r.body.page));
  }
}
const a = await apiGet(`/api/assetmanagement/v3/assets/${id}`, token, { accept: 'application/hal+json' });
console.log('AM asset', a.status, JSON.stringify(a.body.hierarchyPath).slice(0, 700));
