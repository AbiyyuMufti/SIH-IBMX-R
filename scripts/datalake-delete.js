// Deletes ONE object from the data lake: DELETE /objects/{path} (scope dl.ds.d).
// Usage: node scripts/datalake-delete.js <lake path without data/ten=<tenant>/>
import { getToken } from './lib-ih.js';
import { lakeBase, listObjects } from './lib-datalake.js';

const lakePath = process.argv[2];
if (!lakePath || lakePath.endsWith('/') || /^data\/ten=/.test(lakePath)) {
  console.error('usage: <file path, no trailing slash, no data/ten= prefix>');
  process.exit(2);
}
const { token } = await getToken();
const url = lakeBase() + '/objects/' + lakePath.split('/').map(encodeURIComponent).join('/');
const res = await fetch(url, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
});
console.log('DELETE', lakePath, '-> HTTP', res.status);
if (res.status !== 204) {
  console.log((await res.text()).slice(0, 300));
}
const folder = lakePath.replace(/[^/]+$/, '');
const list = await listObjects(token, folder);
const files = (list.body.objects && list.body.objects.files) || [];
console.log('still listed:', files.some((f) => f.key.endsWith('/' + lakePath)));
process.exit(res.status === 204 ? 0 : 1);
