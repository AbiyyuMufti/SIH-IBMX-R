// Turns the Chartres target file (TARGET 2.xlsx, sheet "OEE 2025-2026") into a
// Glidepaths file in the layout of the other sites: Site Name, Line, OEE Bucket,
// then one column per month named 01/MM/YYYY, values in percent (0.4 = 40).
// Usage: node scripts/chartres-glidepath.js [TARGET 2.xlsx] [out csv]
// Default out: sharepoint/reference/glidepaths/site=Chartres/
//   Glidepath Chartres V1 <YYYYMMDD>.csv (git-ignored; upload with
//   node scripts/datalake-upload-tree.js, user's go).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { readXlsx } from './lib-office.js';

const [input, output] = process.argv.slice(2);
const FILE = input ?? 'downloads/01 SITE Chartres/TARGET 2.xlsx';
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const OUT = output ?? `sharepoint/reference/glidepaths/site=Chartres/Glidepath Chartres V1 ${today}.csv`;
const SITE = 'Chartres';
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const sheet = readXlsx(FILE)['OEE 2025-2026'];
const head = sheet[0].map(norm);
// Month headers are Excel dates (first day of the month).
const months = head.map((name, index) => {
  const serial = Number(name);
  if (!Number.isFinite(serial)) {
    return null;
  }
  const iso = new Date((serial - 25569) * 86400000).toISOString().slice(0, 10);
  return iso.endsWith('-01') ? { index, name: `01/${iso.slice(5, 7)}/${iso.slice(0, 4)}` } : null;
}).filter(Boolean);
if (!months.length) {
  throw new Error('no month columns in the target sheet');
}

const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const lines = [['Site Name', 'Line', 'OEE Bucket', ...months.map((m) => m.name)].join(',')];
let rows = 0;
let values = 0;
for (const r of sheet.slice(1)) {
  const line = norm(r[head.indexOf('Line')]);
  const bucket = norm(r[head.indexOf('OEE Bucket')]);
  if (!line || !bucket) {
    continue;
  }
  const cells = months.map((m) => {
    const raw = r[m.index];
    if (raw === '' || raw === undefined || raw === null || !Number.isFinite(Number(raw))) {
      return '';
    }
    values += 1;
    // Percent, rounded: 0.41499999999999998 -> 41.5.
    return String(Math.round(Number(raw) * 100 * 10000) / 10000);
  });
  lines.push([SITE, line, bucket, ...cells].map(cell).join(','));
  rows += 1;
}
mkdirSync(dirname(OUT), { recursive: true });
// Byte order mark like the other Glidepaths files (the lookup removes it).
writeFileSync(OUT, `﻿${lines.join('\r\n')}\r\n`, 'utf8');
console.log(`${OUT}: ${rows} rows, ${months.length} months, ${values} values`);
