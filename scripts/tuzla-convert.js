// Tuzla history load: the workbook 2026_OEE_KPI.xlsx (table of sheet Template,
// one row per line, day, shift and order) to Plan_OPT_EU, Time_Utilisation_EU,
// Daily_Losses_EU and EU_OEE_Fact, through the SAME function nodes the live tab
// will run (scripts/vfc/t1-read-rows.js, t2-plan-time.js, t3-loss-rows.js and
// e2-fact-rows.js), so history and live follow one rule set.
// Usage: node scripts/tuzla-convert.js out=downloads/tuzla-convert/<new folder>
//          [file=<workbook>] [lines=<Machine_Names_EU.csv>] [before=YYYY-MM-DD]
// then:  python -I scripts/helper-chartres-write-parquet.py <out>
// Writes local files only (stage JSON, reference CSVs, checks); nothing is uploaded.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  pbiPlanSchema,
  reportUtilSchema,
  pbiLossSchema,
  euOeeFactSchema,
} from './lib-pbi-report-schemas.js';
import { readXlsx, readZip } from './lib-office.js';
import { code } from './lib-flow-builder.js';
import { lintFunction } from './validate-flow.js';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)),
);
const SITE = 'Tuzla';
const FILE = args.file ?? 'downloads/05 SITE Tuzla/2026_OEE_KPI.xlsx';
const LINES = args.lines ?? 'parquet/daily_refresh/lake/eu_report/report/Dim/Machine_Names_EU.csv';
// before=YYYY-MM-DD: leave out this day and later (the live tab writes them as day files).
const BEFORE = args.before ?? '9999-12-31';
const OUT = args.out;
if (!OUT || existsSync(OUT)) {
  console.error('out=<new folder> is required and must not exist');
  process.exit(1);
}
const LOADED_AT = Date.now();
// Dept, Area, Product Type per line. PROPOSAL (2026-11-19): Area from the
// groups of the workbook (Likit Hatlar = liquids, Toz Hatlar = powders),
// Product Type from the products; to confirm with the site.
const MACHINE_INFO = {
  'Corniani-1': ['Packaging - LIQUIDS', 'LIQUIDS', 'Bottle'],
  'Corniani-2': ['Packaging - LIQUIDS', 'LIQUIDS', 'Bottle'],
  'Corniani-3': ['Packaging - LIQUIDS', 'LIQUIDS', 'Bottle'],
  ACMA: ['Packaging - POWDERS', 'POWDERS', 'Box'],
  FFS: ['Packaging - POWDERS', 'POWDERS', 'Bag'],
  Doypack: ['Packaging - POWDERS', 'POWDERS', 'Pouch'],
};
const TABLES = {
  Plan_OPT_EU: pbiPlanSchema,
  Time_Utilisation_EU: reportUtilSchema,
  Daily_Losses_EU: pbiLossSchema,
};
const key = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[\s-]/g, '').toUpperCase();
const csvCell = (c) => (/[",\n]/.test(String(c ?? '')) ? `"${String(c).replace(/"/g, '""')}"` : String(c ?? ''));
const writeCsv = (path, rows) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${rows.map((r) => r.map(csvCell).join(',')).join('\n')}\n`);
};

// ---- Function nodes with a fake flow context (as test-chartres-live.js) ----
const context = {};
const flow = { get: (k) => context[k], set: (k, v) => { context[k] = v; } };
const nodeApi = { status: () => {}, warn: () => {}, error: (e) => { throw new Error(e); } };
const glob = { get: () => ({ root: 'eu_report' }) };
const runNode = (file, msg, fix = (t) => t) =>
  new Function('node', 'msg', 'flow', 'glob', 'Buffer', fix(code(file)))(nodeApi, msg, flow, glob, Buffer);
let style = 0;
for (const file of ['t1-read-rows.js', 't2-plan-time.js', 't3-loss-rows.js']) {
  for (const p of lintFunction(code(file)).errors) {
    console.log(`style ${file}: ${p}`);
    style += 1;
  }
}

function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const split = (l) => {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < l.length; i += 1) {
      const c = l[i];
      if (quoted && c === '"' && l[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        quoted = !quoted;
      } else if (c === ',' && !quoted) {
        cells.push(cell);
        cell = '';
      } else {
        cell += c;
      }
    }
    cells.push(cell);
    return cells;
  };
  const [head, ...body] = lines.map(split);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// ---- Workbook: the Excel table of Template, keyed by its column names ----
const zip = readZip(FILE);
const tableXml = zip.names.filter((n) => /xl\/tables\/table\d+\.xml$/.test(n))
  .map((n) => zip.read(n).toString('utf8'))
  .find((x) => /displayName="表12_4"/.test(x));
if (!tableXml) {
  throw new Error('table 表12_4 not found in the workbook');
}
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const columns = [...tableXml.matchAll(/<tableColumn [^>]*name="([^"]*)"/g)].map((m) => unescape(m[1]));
const sheets = readXlsx(FILE);
const template = sheets.Template;
const headerAt = template.findIndex((r) => r[1] === 'Üretim Hattı');
// Table ref B4:BL...: column B is index 1.
const tableRows = template.slice(headerAt + 1)
  .map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i + 1] ?? ''])))
  .filter((o) => String(o['Üretim Hattı']).trim() !== '');

// ---- Reference files of the live tab (written to <out>/reference) ----
const lineNames = [...new Set(tableRows.map((o) => String(o['Üretim Hattı']).trim()))];
const machineRows = [['MachineName', 'Dept', 'Area', 'Product Type']];
for (const line of lineNames) {
  const info = MACHINE_INFO[line] ?? ['', '', ''];
  machineRows.push([line, ...info]);
}
writeCsv(join(OUT, 'reference/machine_names/site=Tuzla/Tuzla_MachineNames.csv'), machineRows);
// Rows to add to report/Dim/Machine_Names_EU.csv (the line list of the fact).
const dimRows = lineNames.map((line) => [SITE, line, `${line}-${SITE}`, ...(MACHINE_INFO[line] ?? ['', '', ''])]);
writeCsv(join(OUT, 'reference/Dim/Machine_Names_EU_add_Tuzla.csv'), [
  ['SiteName', 'MachineName', 'Unique Machine Name', 'Dept', 'Area', 'Product Type'],
  ...dimRows,
]);

// Glidepath from sheet "2026 Target": OEE per line and month (fractions -> percent).
const target = sheets['2026 Target'];
const months = [];
const glideRows = [];
let monthCols = null;
for (const r of target) {
  const found = r.map((c, i) => [c, i]).filter(([c]) => /^\d{4}-\d{2}$/.test(String(c)));
  if (found.length) {
    monthCols = found;
    for (const [m] of found) {
      if (!months.includes(m)) {
        months.push(m);
      }
    }
    continue;
  }
  const line = lineNames.find((l) => key(l) === key(r[1]));
  if (monthCols && line) {
    glideRows.push([SITE, line, '% OEE', ...monthCols.map(([, i]) =>
      (r[i] === '' || r[i] === undefined ? '' : Math.round(Number(r[i]) * 1000) / 10))]);
  }
}
const glideHead = ['Site Name', 'Line', 'OEE Bucket', ...months.map((m) => `01/${m.slice(5)}/${m.slice(0, 4)}`)];
writeCsv(join(OUT, 'reference/glidepaths/site=Tuzla/Glidepath Tuzla V1 20261119.csv'), [glideHead, ...glideRows]);

// ---- Lookups through the nodes of the live tab ----
const refs = [
  ['b5-machine-lookup.js', parseCsv(readFileSync(join(OUT, 'reference/machine_names/site=Tuzla/Tuzla_MachineNames.csv'), 'utf8'))],
  ['b5-target-lookup.js', parseCsv(readFileSync(join(OUT, 'reference/glidepaths/site=Tuzla/Glidepath Tuzla V1 20261119.csv'), 'utf8'))],
  ['b5-scope-lookup.js', parseCsv(readFileSync('config/report_scope.csv', 'utf8'))],
];
for (const [file, rows] of refs) {
  const out = runNode(file, { site: SITE, payload: rows });
  const failed = Array.isArray(out) ? out[1]?.payload?.failed : null;
  if (failed) {
    throw new Error(`${file}: ${failed}`);
  }
}

// ---- Rows -> tables (t1 with the first live day moved back) ----
const early = (t) => t.replace(/var FIRST_DAY = '[^']*';/, "var FIRST_DAY = '2000-01-01';");
const read = runNode('t1-read-rows.js', { payload: tableRows }, early);
if (!read[0]) {
  throw new Error(`t1: ${read[1].logText}`);
}
console.log(read[1].logText);
const out = { Plan_OPT_EU: {}, Time_Utilisation_EU: {}, Daily_Losses_EU: {} };
const checks = [['line', 'date', 'note']];
const seen = new Map();
for (const m of read[0].filter((x) => x.iso < BEFORE)) {
  for (const r of m.rows) {
    const id = `${r.line}|${r.iso}|${r.shift}|${r.order}|${r.code}`;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const planned = runNode('t2-plan-time.js', { ...m, loadedAt: LOADED_AT });
  if (!planned[0]) {
    checks.push([m.line, m.iso, planned[1].logText]);
    continue;
  }
  const [built] = runNode('t3-loss-rows.js', planned[0]);
  for (const note of built.notes) {
    checks.push([m.line, m.iso, note]);
  }
  const month = m.iso.slice(0, 7);
  for (const [table, rows] of Object.entries(built.tables)) {
    (out[table][month] ??= []).push(...rows);
  }
}
for (const [id, n] of seen) {
  if (n > 1) {
    const [line, iso, ...rest] = id.split('|');
    checks.push([line, iso, `same shift and order entered ${n} times: ${rest.join(' ')}`]);
  }
}

// ---- Stage JSON of the three tables ----
let files = 0;
const counts = {};
for (const [table, byMonth] of Object.entries(out)) {
  const names = TABLES[table].map(([n]) => n);
  for (const [month, rows] of Object.entries(byMonth)) {
    for (const row of rows) {
      const extra = Object.keys(row).filter((n) => !names.includes(n));
      const missing = names.filter((n) => !(n in row));
      if (extra.length || missing.length) {
        throw new Error(`${table}: columns differ from the schema: extra ${extra} missing ${missing}`);
      }
    }
    const path = join(OUT, 'stage', table, `site=${SITE}`, `${table}_${month}_excel.json`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ schema: TABLES[table], rows }));
    counts[table] = (counts[table] ?? 0) + rows.length;
    files += 1;
  }
}

// ---- EU_OEE_Fact month files through e2-fact-rows.js ----
const factColumns = euOeeFactSchema.map(([n]) => `  '${n}'`).join(',\n');
const lineList = [
  ...parseCsv(readFileSync(LINES, 'utf8')).filter((r) => r.SiteName !== SITE),
  ...dimRows.map((r) => Object.fromEntries(
    ['SiteName', 'MachineName', 'Unique Machine Name', 'Dept', 'Area', 'Product Type'].map((c, i) => [c, r[i]]),
  )),
];
const factMonths = [...new Set(Object.values(out).flatMap((t) => Object.keys(t)))].sort();
let factRows = 0;
for (const month of factMonths) {
  const rows = [];
  for (const table of Object.keys(out)) {
    const source = out[table][month] ?? [];
    if (!source.length) {
      continue;
    }
    const msg = { rows: source, table, site: SITE, month, day: month, mode: 'history', payload: lineList };
    const [mapped] = runNode('e2-fact-rows.js', msg, (t) => t.replace('__COLUMNS__', factColumns));
    rows.push(...mapped.rows);
  }
  const path = join(OUT, 'stage', 'EU_OEE_Fact', `site=${SITE}`, `EU_OEE_Fact_${month}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ schema: euOeeFactSchema, rows }));
  factRows += rows.length;
  files += 1;
}
writeCsv(join(OUT, 'checks.csv'), checks);

// ---- One day against the dashboard sheet Günlük (the day it shows) ----
const shown = sheets['Günlük']?.[0]?.[6];
const excelDay = /^\d+$/.test(String(shown)) ?
  new Date(Date.UTC(1899, 11, 30) + Number(shown) * 86400000).toISOString().slice(0, 10) : null;
if (excelDay) {
  const day = Date.parse(`${excelDay}T00:00:00Z`) / 86400000;
  const plan = (out.Plan_OPT_EU[excelDay.slice(0, 7)] ?? []).filter((r) => r.Date === day);
  const loss = (out.Daily_Losses_EU[excelDay.slice(0, 7)] ?? []).filter((r) => r.Date === day);
  const good = plan.reduce((s, r) => s + r['Good Parts'], 0);
  const cap = plan.reduce((s, r) => s + r.Capacity, 0);
  console.log(`Günlük day ${excelDay}: good ${good}, capacity ${Math.round(cap)}, OEE ${(good / cap * 100).toFixed(1)} %`);
  const byLine = {};
  for (const r of plan) {
    byLine[r.MachineName] ??= [0, 0];
    byLine[r.MachineName][0] += r['Good Parts'];
    byLine[r.MachineName][1] += r.Capacity;
  }
  for (const [line, [g, c]] of Object.entries(byLine)) {
    console.log(`  ${line}: good ${g}, capacity ${Math.round(c)}, OEE ${(g / c * 100).toFixed(1)} %`);
  }
  const bySub = {};
  for (const r of loss) {
    bySub[r.OEELossLvl3SubGroup] = (bySub[r.OEELossLvl3SubGroup] ?? 0) + r['Loss Units'];
  }
  const lossUnits = Object.values(bySub).reduce((s, v) => s + v, 0);
  console.log(`  loss units ${Math.round(lossUnits)} (good + losses = ${Math.round(good + lossUnits)}):`,
    Object.entries(bySub).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
}
console.log(`rows: plan ${counts.Plan_OPT_EU}, time ${counts.Time_Utilisation_EU}, losses ${counts.Daily_Losses_EU}, fact ${factRows}`);
console.log(`${files} stage files in ${OUT}/stage; notes ${checks.length - 1} (${OUT}/checks.csv); style problems ${style}`);
if (style) {
  process.exit(1);
}
