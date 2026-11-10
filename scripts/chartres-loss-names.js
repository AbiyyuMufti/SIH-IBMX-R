// Writes the loss names reference file of the live Chartres flow from a run of
// scripts/chartres-convert.js (its loss-map.json): one row per line and French
// loss column of the workbook, with the English names the report tables use.
// Usage: node scripts/chartres-loss-names.js <run folder> [out csv]
// Default out: sharepoint/reference/localisation/site=Chartres/chartres-losses.csv
// (git-ignored; upload with scripts/datalake-upload-tree.js, user's go).
// The flow reads <root>/reference/localisation/site=Chartres/chartres-losses.csv.
// To change a name: edit the CSV (columns Group, Sub Group, Description,
// Equipment), upload it again. Match only tells where the name came from.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const run = process.argv[2];
if (!run) {
  console.error('usage: node scripts/chartres-loss-names.js <run folder> [out csv]');
  process.exit(1);
}
const OUT = process.argv[3] ?? 'sharepoint/reference/localisation/site=Chartres/chartres-losses.csv';
const SITE = 'Chartres';
const cell = (v) => {
  const t = String(v ?? '');
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

const map = JSON.parse(readFileSync(join(run, 'loss-map.json'), 'utf8'));
map.sort((a, b) => (a.line + a.column < b.line + b.column ? -1 : 1));
const lines = [['Site Name', 'Line', 'Column', 'Group', 'Sub Group', 'Description', 'Equipment', 'Match'].join(',')];
for (const e of map) {
  const match = [e.mdMethod, e.partMethod].filter(Boolean).join(' + ');
  lines.push(
    [SITE, e.line, e.column, e.OEELossLvl3Group, e.OEELossLvl3SubGroup, e.OEELossLvl3Desc, e.Equipment, match]
      .map(cell)
      .join(','),
  );
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `﻿${lines.join('\r\n')}\r\n`, 'utf8');
console.log(`${OUT}: ${map.length} rows`);
