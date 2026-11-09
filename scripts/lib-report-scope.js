// EU report scope of config/report_scope.csv for local scripts (the VFC reads the
// same file in b5-scope-lookup.js). inEuReport(site, table, row) -> true / false.
import { readFileSync } from 'node:fs';

const lines = readFileSync(new URL('../config/report_scope.csv', import.meta.url), 'utf8')
  .replace(/\r/g, '')
  .split('\n')
  .filter(Boolean);
const names = lines[0].split(',');
const rules = lines.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [names[i], v])));
const text = (v) => String(v ?? '').trim();

export function inEuReport(site, table, row) {
  const mine = rules.filter((r) => r.Site === site && r.Tables.split(';').includes(table));
  const keep = {};
  for (const r of mine.filter((x) => x.Rule === 'keep')) {
    (keep[r.Column] ??= []).push(text(r.Value));
  }
  const kept = Object.keys(keep).every((c) => keep[c].includes(text(row[c])));
  const dropped = mine.some((r) => r.Rule === 'drop' && text(row[r.Column]) === text(r.Value));
  return kept && !dropped;
}
