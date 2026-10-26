// Reads the Chartres OEE files in place and writes diagrams/data/chartres-profile.json
// for scripts/build-drawio-chartres.js: per file the machine-part names (French and
// English from the sheet Category), the PlanOPT / LineLosses state, and the export
// folders. No product names are kept. Read only.
// Usage: node scripts/helper-chartres-diagram-data.js [downloads/Chartres]
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsx } from './lib-office.js';

const root = process.argv[2] ?? 'downloads/Chartres';
const OUT = 'diagrams/data/chartres-profile.json';
const PATTERN = /^(.+)\/(\d{4})\/SAISIE OEE\/(OEE (.+) - \d{4}\.xlsm)$/;

const iso = (serial) => new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);
const num = (v) => (v === '' || v === undefined ? 0 : Number(v));
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p.split('\\').join('/')];
  });

// "Dysf X", "Panne X", "Réglages X" or "Réglage X": the part name X, or null for a spare slot.
function part(header, prefix) {
  const m = header.match(new RegExp(`^${prefix}\\s+(.+)$`));
  if (!m || /^(Libre \d+|onctionnement Libre \d+)$/i.test(m[1]) || /Libre \d+$/.test(m[1])) {
    return null;
  }
  return m[1].trim();
}

const files = [];
const all = walk(root);
for (const path of all) {
  const m = path.slice(root.length + 1).match(PATTERN);
  if (!m) {
    continue;
  }
  const x = readXlsx(path);
  const header = x.Base[0];
  const dateCol = header.indexOf('Date');
  const names = header.filter((h) => h !== '' && h !== undefined);
  const dysf = names.map((h) => part(h, 'Dysf')).filter(Boolean);
  const panne = names.map((h) => part(h, 'Panne')).filter(Boolean);
  const regl = names.map((h) => part(h, 'Réglages?')).filter(Boolean);
  const spare = names.filter((h) => /^(Dysfonctionnement Libre|Dysf.*Libre)/.test(h)).length;
  const dates = x.Base.slice(2).map((r) => num(r[dateCol])).filter((v) => v > 40000);
  const category = {};
  for (const r of (x.Category ?? []).slice(2)) {
    if (r[0]) {
      category[r[0]] = { l3: r[1], l2: r[3], l1: r[5] };
    }
  }
  const hasCategory = Object.keys(category).length > 0;
  const anomalies = [];
  for (const [fr, c] of Object.entries(category)) {
    if (/^(Dysf|Panne|Réglage)/.test(fr) && /^Planned/i.test(c.l1 ?? '')) {
      anomalies.push(`${fr} -> ${c.l1} / ${c.l2} / ${c.l3}`);
    }
  }
  const plan = (x.PlanOPT ?? []).slice(1).filter((r) => r[9] !== '' && r[9] !== undefined);
  const lossRows = (x.LineLosses ?? []).slice(1).filter((r) => r[0] !== '' && r[0] !== undefined);
  const day = (x.PlanOPT ?? [])[1]?.[0];
  files.push({
    group: m[1],
    year: m[2],
    line: m[4],
    file: m[3],
    baseColumns: names.length,
    sheets: Object.keys(x),
    dysfParts: dysf.map((fr) => ({ fr, en: category[`Dysf ${fr}`]?.l3 ?? '' })),
    dysfSpare: spare,
    blockSizes: {
      dysf: names.filter((h) => /^Dysf/.test(h)).length,
      panne: names.filter((h) => /^Panne/.test(h)).length,
      reglages: names.filter((h) => /^Réglages? /.test(h)).length,
    },
    peopleZac: names.filter((h) => /^People\s+(Ext\s+)?ZAC/.test(h)).length,
    wasteByMachine: names.filter((h) => /^Déchets (?!PF)/.test(h) && !/^Déchets Libre/.test(h)).length,
    hasCategory,
    categoryRows: Object.keys(category).length,
    categoryAnomalies: anomalies,
    planSheet: Boolean(x.PlanOPT),
    planDay: day && Number(day) > 40000 ? iso(Number(day)) : '',
    planRows: plan.length,
    lossRows: lossRows.length,
    firstDay: dates.length ? iso(Math.min(...dates)) : '',
    lastDay: dates.length ? iso(Math.max(...dates)) : '',
  });
}

// Daily export files saved by the macros: <group>/2026/SAISIE OEE/<folder>/*.xlsx
const exports = {};
for (const path of all) {
  const m = path.slice(root.length + 1).match(/^(.+)\/2026\/SAISIE OEE\/(PlanOPT[^/]*|LineLosses[^/]*)\/(.+\.xlsx)$/i);
  if (!m) {
    continue;
  }
  const key = `${m[1]}|${m[2].toLowerCase()}`;
  const e = (exports[key] ??= { group: m[1], folder: m[2], files: 0, days: [], months: 0, lines: new Set() });
  e.files += 1;
  const d = m[3].match(/_(20\d{6})_/);
  if (d) {
    e.days.push(d[1]);
  } else if (/_\d{6}_/.test(m[3])) {
    e.months += 1;
  }
  e.lines.add(m[3].replace(/_(20\d{6}|\d{6})_.*$/, ''));
}
const exportList = Object.values(exports).map((e) => ({
  group: e.group,
  folder: e.folder,
  files: e.files,
  first: e.days.sort()[0] ?? '',
  last: e.days.sort().at(-1) ?? '',
  monthlyFiles: e.months,
  lines: [...e.lines].sort(),
}));

mkdirSync('diagrams/data', { recursive: true });
writeFileSync(OUT, JSON.stringify({ files, exports: exportList }, null, 1));
console.log(`${OUT}: ${files.length} files, ${exportList.length} export folders`);
