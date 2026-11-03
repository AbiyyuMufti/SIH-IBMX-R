// Adds Volume_CoV_EU and Format_List_EU to a run of scripts/chartres-convert.js.
// Volume_CoV_EU: from the Plan_OPT_EU rows of the run, same rule as the other sites
// (scripts/vfc/b9-cov-rows.js): per day, shift and machine, Good Parts over 1,000.
// Format_List_EU: one row per line and product of the run, brand / format / case from the
// sheet Data of the workbooks (our mapping, constants below, to confirm with the site).
// Brand: from the Data sheet; if the line has no BRAND column, the brand of the same product name
// on another line, else the brand code at the start of the product name (VEET,DE,... = Veet)
// when all products with that code have one brand. Guesses are listed in format-brand-guess.json.
// Usage: node scripts/chartres-extra-tables.js <out of chartres-convert> [root=<workbooks>]
// Writes <out>/stage/<table>/site=Chartres/*.json, then
// `python -I scripts/helper-chartres-write-parquet.py <out>` rewrites the parquet files.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readXlsx } from './lib-office.js';
import { reportCovSchema, reportFormatSchema } from './lib-pbi-report-schemas.js';

const OUT = process.argv[2];
if (!OUT) {
  console.error('usage: node scripts/chartres-extra-tables.js <out folder of chartres-convert>');
  process.exit(1);
}
const rootArg = process.argv.slice(2).find((a) => a.startsWith('root='));
const SITE = 'Chartres';
const MIN_GOOD_PARTS = 1000;
// Sheet Data columns (the site's headers). Product names: the column whose text equals the
// PartName of the plan rows.
const NAME_COLUMNS = ['PF NAME', 'FORMULA NAME'];
const FORMAT_COLUMN = 'FORMAT';
const CASE_COLUMN = 'CASE';
const BRAND_COLUMN = 'BRAND';

const { root: runRoot } = JSON.parse(readFileSync(join(OUT, 'days.json'), 'utf8'));
const ROOT = rootArg ? rootArg.slice(5) : runRoot;
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const planDir = join(OUT, 'stage', 'Plan_OPT_EU', `site=${SITE}`);
const months = readdirSync(planDir).map((f) => f.match(/_(\d{4}-\d{2})_excel/)[1]);
const loadedAt = JSON.parse(readFileSync(join(planDir, readdirSync(planDir)[0]), 'utf8')).rows[0].loaded_at;
const write = (table, name, schema, rows) => {
  const path = join(OUT, 'stage', table, `site=${SITE}`, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ schema, rows }));
};

// ---- Volume_CoV_EU ----
const covRows = {};
const products = new Map();
for (const month of months) {
  const rows = JSON.parse(readFileSync(join(planDir, `Plan_OPT_EU_${month}_excel.json`), 'utf8')).rows;
  const groups = new Map();
  for (const r of rows) {
    products.set(`${r.MachineName}|${r.PartName}`, { line: r.MachineName, name: r.PartName });
    const k = `${r.Date}|${r.ShiftName}|${r.MachineName}`;
    const g = groups.get(k) ?? { r, good: 0, time: 0, cap: null };
    g.good += r['Good Parts'] ?? 0;
    g.time += r['Total Time'] ?? 0;
    g.cap = g.cap === null || (r.Capacity ?? 0) > g.cap ? r.Capacity : g.cap;
    groups.set(k, g);
  }
  covRows[month] = [...groups.values()]
    .filter((g) => g.good > MIN_GOOD_PARTS)
    .map(({ r, good, time, cap }) => ({
      Date: r.Date,
      MachineName: r.MachineName,
      'Shift Colour': r.ShiftName,
      'Good Parts Sum': good,
      'Shift Machine Key': `${r.ShiftName} ${r.MachineName}`,
      'Cap Max': cap,
      'Time on Shift': time * 60000,
      Dept: null,
      Area: null,
      'Product Type': null,
      'Unique Machine Name': r['Unique Machine Name'],
      SiteName: SITE,
      'Data Source': 'Excel',
      'In EU Report': true,
      loaded_at: loadedAt,
    }));
  write('Volume_CoV_EU', `Volume_CoV_EU_${month}_excel.json`, reportCovSchema, covRows[month]);
}

// ---- Format_List_EU: sheet Data of each workbook (2026 file first, then 2025) ----
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name).split('\\').join('/')],
  );
const files = walk(ROOT)
  .filter((p) => /\/(\d{4})\/SAISIE OEE\/OEE [^/]+\.xlsm$/.test(p))
  .sort((a, b) => (a.match(/(\d{4})\/SAISIE/)[1] < b.match(/(\d{4})\/SAISIE/)[1] ? 1 : -1));
const dataOf = {};
const brandByName = new Map();
const brandsByPrefix = new Map();
for (const path of files) {
  const line = path.split('/').at(-1).replace(/^OEE /, '').replace(/ - \d{4}\.xlsm$/, '');
  const sheet = readXlsx(path).Data ?? [];
  const head = (sheet[0] ?? []).map(norm);
  const byName = (dataOf[line] ??= new Map());
  for (const row of sheet.slice(1)) {
    for (const c of NAME_COLUMNS) {
      const name = norm(row[head.indexOf(c)]);
      if (name && !byName.has(name)) {
        const brand = norm(row[head.indexOf(BRAND_COLUMN)]);
        if (brand) {
          brandByName.set(name, brand);
          const prefix = name.split(',')[0].toUpperCase();
          const counts = brandsByPrefix.get(prefix) ?? new Map();
          counts.set(brand, (counts.get(brand) ?? 0) + 1);
          brandsByPrefix.set(prefix, counts);
        }
        byName.set(name, { brand: norm(row[head.indexOf(BRAND_COLUMN)]), format: norm(row[head.indexOf(FORMAT_COLUMN)]), cases: norm(row[head.indexOf(CASE_COLUMN)]) });
      }
    }
  }
}
// "200ml - Cap" -> size "200ml", extra "Cap". "X6" -> "6".
const splitFormat = (f) => {
  const [size, ...rest] = f.split(/\s+-\s+/);
  return [norm(size), norm(rest.join(' - '))];
};
// The prefix gives a brand only when every spelling is the same word (VEET / Veet).
const prefixBrand = new Map();
for (const [prefix, counts] of brandsByPrefix) {
  const names = new Set([...counts.keys()].map((b) => b.toUpperCase()));
  if (names.size === 1) {
    prefixBrand.set(prefix, [...counts].sort((a, b) => b[1] - a[1])[0][0]);
  }
}
const formatRows = [];
const guesses = [];
let missing = 0;
for (const { line, name } of [...products.values()].sort((a, b) => (a.line + a.name < b.line + b.name ? -1 : 1))) {
  const d = dataOf[line]?.get(name);
  if (!d) {
    missing += 1;
  }
  const [size, extra] = splitFormat(d?.format ?? '');
  let brand = d?.brand ?? '';
  if (!brand) {
    const other = brandByName.get(name);
    const byPrefix = prefixBrand.get(name.split(',')[0].toUpperCase());
    brand = other ?? byPrefix ?? '';
    if (brand) {
      guesses.push({ line, name, brand, from: other ? 'same product on another line' : 'brand code at the start of the name' });
    }
  }
  formatRows.push({
    'Site Name': SITE,
    MachineName: line,
    'Product Name': name,
    Brand: brand,
    'Unit Size': size,
    'Unit Count/Format': d ? d.cases.replace(/^x\s*/i, '') : '',
    'Extra Info': extra,
    'Unique Machine Name': `${line}-${SITE}`,
    'Product Key': `${line}-${SITE} ${name}`,
    loaded_at: loadedAt,
  });
}
write('Format_List_EU', 'Format_List_EU.json', reportFormatSchema, formatRows);
writeFileSync(join(OUT, 'format-brand-guess.json'), JSON.stringify(guesses, null, 1));
const covTotal = Object.values(covRows).reduce((t, r) => t + r.length, 0);
console.log(`Volume_CoV_EU: ${covTotal} rows in ${months.length} months; Format_List_EU: ${formatRows.length} rows, ${missing} products without a Data row; brand guessed for ${guesses.length}, still empty for ${formatRows.filter((r) => !r.Brand).length}`);
if (!existsSync(join(OUT, 'report'))) {
  console.log('run the parquet writer next');
}
