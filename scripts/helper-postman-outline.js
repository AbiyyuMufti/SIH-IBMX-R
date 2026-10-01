// Read-only, no network. Prints an outline of a Postman collection.
// Never prints header/auth/body VALUES: only names, URLs (with {{vars}}), methods.
// Usage: node scripts/helper-postman-outline.js source/<file>.json
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const col = JSON.parse(readFileSync(file, 'utf8'));

const rawUrl = (u) => (typeof u === 'string' ? u : u?.raw ?? '');
const authSummary = (a) => {
  if (!a) return '-';
  const t = a.type;
  const keys = Array.isArray(a[t]) ? a[t].map((k) => `${k.key}=${/\{\{.*\}\}/.test(String(k.value)) ? k.value : (k.value ? '<set>' : '<blank>')}`) : [];
  return `${t}(${keys.join(', ')})`;
};
const hdrSummary = (hs = []) =>
  hs.map((h) => `${h.key}${h.disabled ? '[off]' : ''}=${/^\{\{.*\}\}$/.test(String(h.value)) ? h.value : (h.value ? '<set>' : '<blank>')}`).join('; ');

console.log('NAME:', col.info?.name, '| schema:', col.info?.schema);
console.log('COLLECTION AUTH:', authSummary(col.auth));
console.log('COLLECTION VARIABLES:', (col.variable ?? []).map((v) => `${v.key}=${v.value ? '<set>' : '<blank>'}`).join(', ') || '-');
const scriptLines = (evs = []) => evs.map((e) => `${e.listen}:${(e.script?.exec ?? []).length} lines`).join(', ');
console.log('COLLECTION EVENTS:', scriptLines(col.event) || '-');

let n = 0;
function walk(items, path, inheritedAuth) {
  for (const it of items) {
    if (it.item) {
      console.log(`FOLDER ${[...path, it.name].join(' / ')} auth=${authSummary(it.auth)} events=${scriptLines(it.event) || '-'}`);
      walk(it.item, [...path, it.name], it.auth ?? inheritedAuth);
    } else {
      n++;
      const r = it.request ?? {};
      const body = r.body ? `${r.body.mode}${r.body.mode === 'urlencoded' ? '[' + (r.body.urlencoded ?? []).map((x) => x.key).join(',') + ']' : ''}` : '-';
      console.log(`#${n} ${[...path, it.name].join(' / ')}`);
      console.log(`   ${r.method} ${rawUrl(r.url)}`);
      console.log(`   auth=${authSummary(r.auth)} inherited=${authSummary(inheritedAuth)} headers=${hdrSummary(r.header)} body=${body} events=${scriptLines(it.event) || '-'}`);
    }
  }
}
walk(col.item ?? [], [], col.auth);
console.log('TOTAL REQUESTS:', n);
