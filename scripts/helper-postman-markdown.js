// Read-only, no network. Prints a markdown table of every request in a Postman collection.
// Never prints header/auth/body VALUES: only names, URLs (with {{vars}}) and methods.
// Inline (non-variable) credentials in auth are shown as "inline <set>" only.
// Usage: node scripts/helper-postman-markdown.js source/<file>.json
import { readFileSync } from 'node:fs';

const col = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const isVar = (v) => /^\{\{[^}]+\}\}$/.test(String(v ?? '').trim());
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|');

const authText = (a) => {
  if (!a) return 'inherits (none)';
  if (a.type === 'noauth') return 'none';
  const kv = a[a.type] ?? [];
  const pick = (k) => kv.find((x) => x.key === k)?.value;
  if (a.type === 'bearer') {
    const t = pick('token');
    return isVar(t) ? `Bearer ${t}` : 'Bearer inline <set>';
  }
  if (a.type === 'basic') {
    const u = pick('username');
    const p = pick('password');
    return `Basic user=${isVar(u) ? u : 'inline <set>'}, password=${isVar(p) ? p : 'inline <set>'}`;
  }
  return a.type;
};
const hdrNames = (hs = []) => hs.filter((h) => !h.disabled).map((h) => h.key).join(', ');
const scriptNote = (evs = []) => {
  const out = [];
  for (const e of evs) {
    const t = (e.script?.exec ?? []).join('\n');
    if (!t.trim()) continue;
    const sets = [...t.matchAll(/pm\.(?:environment|collectionVariables|globals|variables)\.set\(\s*["']([^"']+)/g)].map((m) => m[1]);
    out.push(`${e.listen}${sets.length ? ' sets ' + [...new Set(sets)].join(',') : ''}`);
  }
  return out.join('; ');
};

let n = 0;
const rows = {};
function walk(items, path) {
  for (const it of items) {
    if (it.item) walk(it.item, [...path, it.name]);
    else {
      n++;
      const r = it.request ?? {};
      const url = typeof r.url === 'string' ? r.url : r.url?.raw ?? '';
      const body = r.body ? (r.body.mode === 'urlencoded' ? `urlencoded(${(r.body.urlencoded ?? []).map((x) => x.key).join(',')})` : r.body.mode) : '';
      const key = path.join(' / ') || '(root)';
      (rows[key] ??= []).push(
        `| ${n} | ${cell(it.name)} | ${r.method} | \`${cell(url)}\` | ${cell(authText(r.auth))} | ${cell(hdrNames(r.header))} | ${cell(body)} | ${cell(scriptNote(it.event))} |`,
      );
    }
  }
}
walk(col.item ?? [], []);
for (const [folder, list] of Object.entries(rows)) {
  console.log(`\n### ${folder}\n`);
  console.log('| # | Name | Method | URL | Auth | Headers | Body | Scripts |');
  console.log('|---|---|---|---|---|---|---|---|');
  list.forEach((l) => console.log(l));
}
console.error('TOTAL', n);
