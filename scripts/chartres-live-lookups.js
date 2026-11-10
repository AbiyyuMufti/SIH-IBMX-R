// Builds the lookup file of the live Chartres flow (tab Chartres live): the
// lines, the loss names, the targets and the report scope, taken from a run of
// scripts/chartres-convert.js so the flow and the script give the same names.
// Usage: node scripts/chartres-live-lookups.js <run folder> <out file>
//          [targets=<TARGET 2.xlsx>]
// The run folder needs stage/, loss-map.json and days.json. Upload the out
// file to <root>/chartres_live/lookups/chartres_lookups.json (user's go).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsx } from './lib-office.js';
import { inEuReport } from './lib-report-scope.js';

const [run, outFile] = process.argv.slice(2).filter((a) => !a.includes('='));
if (!run || !outFile) {
  console.error('usage: node scripts/chartres-live-lookups.js <run> <out file>');
  process.exit(1);
}
const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)),
);
const TARGETS = args.targets ?? 'downloads/01 SITE Chartres/TARGET 2.xlsx';
const SITE = 'Chartres';
const TABLES = ['Plan_OPT_EU', 'Time_Utilisation_EU', 'Daily_Losses_EU', 'Volume_CoV_EU'];
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const key = (s) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s-]/g, '').toUpperCase();

// Lines: the machine columns of the plan rows of the run, by file line name.
const days = JSON.parse(readFileSync(join(run, 'days.json'), 'utf8')).days;
const planDir = join(run, 'stage', 'Plan_OPT_EU', `site=${SITE}`);
const machines = {};
for (const f of readdirSync(planDir)) {
  for (const r of JSON.parse(readFileSync(join(planDir, f), 'utf8')).rows) {
    machines[r.MachineName] ??= {
      machine: r.MachineName,
      unique: r['Unique Machine Name'],
      areaName: r.AreaName,
      dept: r.Dept,
      area: r.Area,
      type: r['Product Type'],
    };
  }
}
const lines = {};
for (const d of days) {
  const fileLine = d.file.split('/').at(-1).replace(/^OEE /, '').replace(/ - \d{4}\.xlsm?$/, '');
  const m = machines[d.line];
  if (m) {
    const inEu = {};
    for (const table of TABLES) {
      inEu[table] = inEuReport(SITE, table, { MachineName: m.machine });
    }
    lines[key(fileLine)] = { ...m, inEu };
  }
}

// Loss names: line|column -> [group, sub group, description, equipment].
const loss = {};
for (const e of JSON.parse(readFileSync(join(run, 'loss-map.json'), 'utf8'))) {
  loss[`${e.line}|${e.column}`] = [
    e.OEELossLvl3Group,
    e.OEELossLvl3SubGroup,
    e.OEELossLvl3Desc,
    e.Equipment,
  ];
}
// Block rule for a loss column that is not in the map (same as PREFIX, SUB and
// GROUP of scripts/chartres-convert.js): [regex source, group, sub group].
const prefix = [
  ['^Dysf ', 'Unplanned Loss', 'Minor Stops'],
  ['^Pannes? ', 'Unplanned Loss', 'Breakdown'],
  ['^Réglages? ', 'Unplanned Loss', 'Adjustments'],
  ['^Orga', 'Planned Loss', 'Cleaning'],
  ['^Changement', 'Planned Loss', 'Product Changeover'],
  ['^Rupture', 'Unplanned Loss', 'Lack Of Resources'],
  ['^Qualité', 'Unplanned Loss', 'Quality Issues'],
  ['^Maintenance', 'Planned Loss', 'Planned Maintenance'],
];

// Format List: Product Key -> [Brand, Unit Size, Unit Count/Format, Extra Info]
// (the plan rows carry them; a product not in the list gets empty ones).
const format = {};
const formatFile = join(run, 'stage', 'Format_List_EU', `site=${SITE}`, 'Format_List_EU.json');
for (const r of JSON.parse(readFileSync(formatFile, 'utf8')).rows) {
  format[r['Product Key']] = [r.Brand || null, r['Unit Size'] || null, r['Unit Count/Format'] || null, r['Extra Info'] || null];
}

// Targets: line key -> month -> bucket -> fraction (TARGET 2.xlsx).
const sheet = readXlsx(TARGETS)['OEE 2025-2026'];
const head = sheet[0].map(norm);
const monthOf = (value) => {
  const serial = Number(value);
  if (!Number.isFinite(serial)) {
    return null;
  }
  const iso = new Date((serial - 25569) * 86400000).toISOString().slice(0, 10);
  return iso.endsWith('-01') ? iso.slice(0, 7) : null;
};
const targets = {};
for (const r of sheet.slice(1)) {
  const line = norm(r[head.indexOf('Line')]);
  const bucket = norm(r[head.indexOf('OEE Bucket')]);
  if (!line || !bucket || key(norm(r[head.indexOf('Site Name')])) !== key(SITE)) {
    continue;
  }
  head.forEach((name, i) => {
    const month = monthOf(name);
    const raw = r[i];
    if (month && raw !== '' && raw !== undefined && raw !== null && Number.isFinite(Number(raw))) {
      ((targets[key(line)] ??= {})[month] ??= {})[bucket] = Number(raw);
    }
  });
}

// Report scope of the site, in the shape of the filler node (keep / drop).
const scope = {};
for (const table of TABLES) {
  const drop = [];
  for (const m of Object.values(machines)) {
    if (!inEuReport(SITE, table, { MachineName: m.machine })) {
      drop.push(m.machine);
    }
  }
  scope[table] = { keep: {}, drop: drop.length ? { MachineName: drop } : {} };
}

const lookups = { built: new Date().toISOString().slice(0, 10), lines, loss, prefix, format, targets, scope };
writeFileSync(outFile, JSON.stringify(lookups));
console.log(
  `${outFile}: ${Object.keys(lines).length} lines, ${Object.keys(loss).length} loss columns, ` +
    `${Object.keys(targets).length} target lines, ${JSON.stringify(lookups).length} bytes`,
);
