// Writes the rows of ONE line and ONE day of a run as a csv per SIH table, to show the site
// what the Tableau tables hold. Dates are YYYY-MM-DD, timestamps ISO, empty = no value.
// Usage: node scripts/chartres-one-day.js <out of chartres-convert> <LINE> <YYYY-MM-DD> <folder>
// Tables: Time_Utilisation_EU, Plan_OPT_EU, Daily_Losses_EU, Volume_CoV_EU (that day),
// Format_List_EU (the products of that day). utf-8 with a BOM so Excel reads the accents.
// The files hold site values: never commit them (*.csv is git-ignored).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [OUT, LINE, DATE, TARGET] = process.argv.slice(2);
if (!TARGET) {
  console.error('usage: node scripts/chartres-one-day.js <run folder> <LINE> <YYYY-MM-DD> <new folder>');
  process.exit(1);
}
const month = DATE.slice(0, 7);
const stage = (table, name) => JSON.parse(readFileSync(join(OUT, 'stage', table, 'site=Chartres', name), 'utf8'));
const isoDate = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
// A time of day is stored on 1970-01-01 (Duration, Time on Shift): shown as HH:MM:SS.
const isoTime = (ms) => {
  const text = new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  return text.startsWith('1970-01-01') ? text.slice(11) : text;
};
const cell = (value, type) => {
  if (value === null || value === undefined) {
    return '';
  }
  const text = type === 'DATE' ? isoDate(value) : type === 'TIMESTAMP_MILLIS' ? isoTime(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = ({ schema, rows }) =>
  `﻿${[schema.map(([n]) => n).join(','), ...rows.map((r) => schema.map(([n, t]) => cell(r[n], t)).join(','))].join('\n')}\n`;

mkdirSync(TARGET, { recursive: true });
const day = (r) => r.MachineName === LINE && isoDate(r.Date) === DATE;
const tables = {};
for (const t of ['Time_Utilisation_EU', 'Plan_OPT_EU', 'Daily_Losses_EU', 'Volume_CoV_EU']) {
  const f = stage(t, `${t}_${month}_excel.json`);
  tables[t] = { schema: f.schema, rows: f.rows.filter(day) };
}
const names = new Set(tables.Plan_OPT_EU.rows.map((r) => r.PartName));
const format = stage('Format_List_EU', 'Format_List_EU.json');
tables.Format_List_EU = { schema: format.schema, rows: format.rows.filter((r) => r.MachineName === LINE && names.has(r['Product Name'])) };
for (const [t, data] of Object.entries(tables)) {
  writeFileSync(join(TARGET, `${t}.csv`), csv(data));
  console.log(`${t}.csv: ${data.rows.length} rows, ${data.schema.length} columns`);
}
