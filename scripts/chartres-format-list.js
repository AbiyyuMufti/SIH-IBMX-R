// Writes the Chartres Format List reference file from a run of
// scripts/chartres-extra-tables.js (stage Format_List_EU), in the layout of the
// Format List files of the other sites: Site Name, MachineName, Product Name,
// Brand, Unit Size, Unit Count/Format, Extra Info.
// Usage: node scripts/chartres-format-list.js <run folder> [out csv]
// Default out: sharepoint/reference/format_list/site=Chartres/
//   Format List Chartres 2026.csv (git-ignored; upload with
//   scripts/datalake-upload-tree.js, user's go). A new product: add a row.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const run = process.argv[2];
if (!run) {
  console.error('usage: node scripts/chartres-format-list.js <run folder> [out csv]');
  process.exit(1);
}
const OUT = process.argv[3] ?? 'sharepoint/reference/format_list/site=Chartres/Format List Chartres 2026.csv';
const COLUMNS = ['Site Name', 'MachineName', 'Product Name', 'Brand', 'Unit Size', 'Unit Count/Format', 'Extra Info'];
const cell = (v) => {
  const t = String(v ?? '');
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

const file = join(run, 'stage', 'Format_List_EU', 'site=Chartres', 'Format_List_EU.json');
const rows = JSON.parse(readFileSync(file, 'utf8')).rows;
const lines = [COLUMNS.join(',')];
for (const r of rows) {
  lines.push(COLUMNS.map((c) => cell(r[c])).join(','));
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `﻿${lines.join('\r\n')}\r\n`, 'utf8');
console.log(`${OUT}: ${rows.length} rows`);
