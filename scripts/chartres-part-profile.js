// Chartres: profile the machine part level (read only).
// In: run folder (loss-map.json), MASTERDATA.xlsx sheet Downtime_updated (machine block).
// Out: <run>/part-profile.json and a summary on the console.
// Usage: node scripts/chartres-part-profile.js downloads/chartres-convert/run9 [masterdata=<xlsx>]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsx } from './lib-office.js';

const run = process.argv[2];
const mdArg = process.argv.find((a) => a.startsWith('masterdata='));
const MD = mdArg ? mdArg.slice(11) : 'downloads/01 SITE Chartres/MASTERDATA.xlsx';
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const key = (s) =>
  norm(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

// Machine block: line, line, machine EN, machine FR, type EN, type FR, part EN, part FR.
const parts = {};
const sheet = readXlsx(MD).Downtime_updated;
if (process.argv.includes('head')) {
  sheet.slice(0, 6).forEach((r) => console.log(JSON.stringify(r.slice(10))));
  process.exit(0);
}
for (const r of sheet.slice(2).map((x) => x.map(norm))) {
  if (r[10] && r[12] && r[16]) {
    const list = (parts[key(r[10])] ??= []);
    if (!list.some((p) => p.machine === r[12] && p.en === r[16])) {
      list.push({ machine: r[12], machineFr: r[13], en: r[16], fr: r[17] });
    }
  }
}
const lossMap = JSON.parse(readFileSync(join(run, 'loss-map.json'), 'utf8'));
const PREFIX = /^(Dysf|Pannes?|Réglages?) (Ext ZAC |ZAC - |ZAC )?/i;
const out = [];
for (const e of lossMap.filter((x) => x.machineLoss)) {
  const list = parts[key(e.line)];
  const rest = e.column.replace(PREFIX, '');
  let cls;
  let hit = null;
  let cands = [];
  if (!list) {
    cls = 'no machine in MASTERDATA';
  } else {
    const mine = list.filter((p) => p.machine === e.Equipment);
    const machFr = mine[0]?.machineFr ?? '';
    // part words: column text without the machine's French name
    let words = rest;
    if (machFr && key(rest).startsWith(key(machFr))) {
      words = rest.slice(machFr.length);
    }
    // a plural left from the machine name (BOL POMPES vs Bol pompe) is no part
    const w = key(words).length <= 1 ? '' : key(words);
    if (!mine.length) {
      cls = 'no machine in MASTERDATA';
    } else if (!w) {
      cls = 'machine only (by design)';
    } else {
      cands = mine.filter((p) => key(p.fr) === w || key(p.en) === w);
      if (cands.length) {
        cls = 'exact part';
      } else {
        cands = mine.filter((p) => {
          const f = key(p.fr);
          return (
            (f.length >= 4 && w.includes(f)) ||
            (w.length >= 5 && f.includes(w))
          );
        });
        cls = cands.length ? 'contained / synonym' : 'no part found';
      }
      if (cands.length > 1) {
        cls += ' (several parts)';
      }
      hit = cands.length === 1 ? cands[0] : null;
    }
  }
  out.push({
    line: e.line,
    column: e.column,
    machine: e.Equipment,
    cls,
    partEn: hit?.en ?? null,
    partFr: hit?.fr ?? null,
    candidates: cands.map((c) => c.fr).join(' | '),
    minutes: e.minutes,
    rows: e.rows,
  });
}
writeFileSync(join(run, 'part-profile.json'), JSON.stringify(out, null, 1));
const by = {};
for (const o of out) {
  const b = (by[o.cls] ??= { cols: 0, rows: 0, minutes: 0 });
  b.cols += 1;
  b.rows += o.rows;
  b.minutes += o.minutes;
}
console.table(by);
