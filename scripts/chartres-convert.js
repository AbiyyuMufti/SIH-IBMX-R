// Converts the Chartres OEE workbooks (sheet Base, 2025 and 2026) into the three
// report tables and two site target tables, using the report schemas.
// Rules and choices: docs/chartres-convert.md. Read only on the workbooks.
// Usage: node scripts/chartres-convert.js [downloads/01 SITE Chartres] [out=<new folder>]
//          [targets=<TARGET 2.xlsx>] [masterdata=<MASTERDATA.xlsx>] [years=2025,2026]
// Writes stage JSON, checks.csv, duplicates.csv, loss-map.json and days.json.
// Then `python -I scripts/helper-chartres-write-parquet.py <out>` writes local
// parquet files under <out>/report/ (the lake layout of docs/report-config.md).
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readXlsx } from './lib-office.js';
import {
  pbiPlanSchema,
  reportUtilSchema,
  pbiLossSchema,
  reportPdtSchema,
  reportUpdtSchema,
} from './lib-pbi-report-schemas.js';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)),
);
const ROOT = process.argv.slice(2).find((a) => !a.includes('=')) ?? 'downloads/01 SITE Chartres';
const OUT = args.out ?? 'downloads/chartres-convert/run1';
const TARGETS = args.targets ?? join(ROOT, 'TARGET 2.xlsx');
const MASTERDATA = args.masterdata ?? join(ROOT, 'MASTERDATA.xlsx');
const YEARS = (args.years ?? '2025,2026').split(',');

// Settings (docs/chartres-convert.md, open decisions of docs/chartres-source-files.md section 5).
const SITE = 'Chartres';
const DATA_SOURCE = 'Excel';
const FILE_SUFFIX = 'excel';
// Folder of the group -> AreaName (the names of the macro export and of the target file).
const AREA = { 'CREAM Chartres': 'CREAM', 'NON TISSE': 'NON WOVEN', 'SKIN CARE': 'SKIN CARE' };
// Chartres shift type -> report shift name. Times (site, 2026-11): Semaine Matin 05-13,
// Après Midi 13-21, Nuit 21-05; Weekend Matin 05-17, Weekend Nuit 17-05.
const SHIFTS = {
  'Semaine Matin': 'Day',
  'Semaine Après Midi': 'Afternoon',
  'Semaine Nuit': 'Night',
  'Weekend Matin': 'Day',
  'Weekend Nuit': 'Night',
};
// Shift start times (Laura, 2026-11), ms of the day on 1970-01-01.
const SHIFT_START = {
  'Semaine Matin': 5,
  'Semaine Après Midi': 13,
  'Semaine Nuit': 21,
  'Weekend Matin': 5,
  'Weekend Nuit': 17,
};
// Format List columns: filled in the plan rows by scripts/chartres-extra-tables.js.
const NO_FORMAT = { Brand: null, 'Unit Size': null, 'Unit Count/Format': null, 'Extra Info': null };
// Category Level 1 / Level 2 (English) -> the group and sub group names of the EU tables.
const GROUP = { 'Planned losses': 'Planned Loss', 'Unplanned losses': 'Unplanned Loss' };
const SUB = {
  'Minor stop': 'Minor Stops',
  Adjustment: 'Adjustments',
  'Lack of Resources': 'Lack Of Resources',
  'Quality issue': 'Quality Issues',
  'Reduced speed': 'Reduced Speed',
  'Planned maintenance': 'Planned Maintenance',
  'Meals & breaks': 'Breaks / Meals',
  'Start-up/end-up & Sanitization': 'Start up and Sanitisation',
  Changeover: 'Product Changeover',
  Undefined: 'Not Logged',
};
// Time_Utilisation_EU: TOR is the base of the workbook OEE (Total Time = TOR, proposal 1).
const PLANNED_OPT_FROM = 'TOR';
// Machine Names of Chartres (site file, 2026-11-05), one entry per machine.
// ZEUS and APOLLON have two product types in the site file; both are set to Bottle
// (agreed with the site, 2026-11-05): the report tables have one row per machine.
// name = MachineName of the site file, used in every row.
const MACHINE_INFO = {
  NEPTUNE: { name: 'NEPTUNE', dept: 'Packaging - SKIN CARE', area: 'SKIN CARE', type: 'Bottle Cap' },
  ZEUS: { name: 'ZEUS', dept: 'Packaging - SKIN CARE', area: 'SKIN CARE', type: 'Bottle' },
  APOLLON: { name: 'APOLLON', dept: 'Packaging - SKIN CARE', area: 'SKIN CARE', type: 'Bottle' },
  OLYMPE: { name: 'OLYMPE', dept: 'Packaging - SKIN CARE', area: 'SKIN CARE', type: 'Tube' },
  CLEOPATRE: { name: 'CLEOPATRE', dept: 'Packaging - SKIN CARE', area: 'SKIN CARE', type: 'Tube' },
  IWKA1: { name: 'IWKA1', dept: 'Packaging - CREAM', area: 'CREAM', type: 'Tube' },
  IWKA2: { name: 'IWKA2', dept: 'Packaging - CREAM', area: 'CREAM', type: 'Tube' },
  IWKA3: { name: 'IWKA3', dept: 'Packaging - CREAM', area: 'CREAM', type: 'Tube' },
  CUMULUS: { name: 'CUMULUS', dept: 'Packaging - NON WOVEN', area: 'NON WOVEN', type: 'Bottle' },
  HOME1: { name: 'HOME1', dept: 'Packaging - NON WOVEN', area: 'NON WOVEN', type: 'Wax strip' },
  HOME2: { name: 'HOME2', dept: 'Packaging - NON WOVEN', area: 'NON WOVEN', type: 'Wax strip' },
  HOME3: { name: 'HOME3', dept: 'Packaging - NON WOVEN', area: 'NON WOVEN', type: 'Wax strip' },
  HOME4: { name: 'HOME4', dept: 'Packaging - NON WOVEN', area: 'NON WOVEN', type: 'Wax strip' },
  SACHA1: { name: 'SACHA1', dept: 'Packaging - NON WOVEN', area: 'NON WOVEN', type: 'Wipes' },
  SACHA2: { name: 'SACHA2', dept: 'Packaging - NON WOVEN', area: 'NON WOVEN', type: 'Wipes' },
  SUGAR: { name: 'SUGAR', dept: 'Packaging - NON WOVEN', area: 'NON WOVEN', type: 'Jar' },
};
// English for the machine parts that have no Category row (CUPIDON, DAISY: dropped in 2026,
// not in MASTERDATA). Our translation, brands kept: to confirm with the site.
const PART_EN = {
  APEX: 'APEX',
  'BALANCE SARTORIUS': 'Sartorius scale',
  'BOL ÉPONGES': 'Sponge feeder bowl',
  'CAMÉRA ISI VISION': 'ISI VISION camera',
  CERMEX: 'CERMEX case packer',
  'CIM ROBOT TUBES': 'CIM tube robot',
  'DOMINO - ÉTIQUETTES CAISSES': 'DOMINO case labels',
  'DOMINO BLISTER': 'DOMINO blister coder',
  'DOMINO TUBES': 'DOMINO tube coder',
  'DOMINO ÉTUIS': 'DOMINO carton coder',
  'EMPILEUR FOUR BFB': 'BFB oven stacker',
  ETUYEUSE: 'Cartoner',
  'ETUYEUSE - VERIN SORTIE': 'Cartoner outfeed cylinder',
  'ETUYEUSE BARILLET': 'Cartoner barrel',
  'METTLER TRIEUSE': 'METTLER checkweigher',
  'MÉCA PLASTIQUE': 'MECA PLASTIQUE',
  'Palettiseur NEWTEC': 'NEWTEC palletiser',
  'ROBOT Dépose Éponges': 'Sponge placing robot',
  'SCOTCHEUSE SOCO': 'SOCO case taper',
  TGM: 'TGM',
  VIMCO: 'VIMCO',
};
// French words left in the English Category names (SACHA lanes).
const WORD_EN = [[/^Piste /, 'Lane ']];

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p.split('\\').join('/')];
  });
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const key = (s) => norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]/g, '').toUpperCase();
const num = (v) => (v === '' || v === undefined || v === null ? 0 : Number(v) || 0);
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dayNumber = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000;
const excelMonth = (value) => {
  const serial = Number(value);
  if (!Number.isFinite(serial)) {
    return null;
  }
  const date = new Date((serial - 25569) * 86400000);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  const iso = date.toISOString().slice(0, 10);
  return iso.endsWith('-01') ? iso.slice(0, 7) : null;
};
const LOADED_AT = Date.now();

if (existsSync(join(OUT, 'stage'))) {
  console.error(`${OUT}/stage exists: give a new out= folder`);
  process.exit(1);
}

// ---- Targets: one row per line, bucket and month (Glidepaths) ----
function readTargets(path) {
  const sheet = readXlsx(path)['OEE 2025-2026'];
  const head = sheet[0].map(norm);
  const required = ['Site Name', 'Line', 'OEE Bucket'];
  const missing = required.filter((name) => !head.includes(name));
  if (missing.length) {
    throw new Error(`targets file is missing columns: ${missing.join(', ')}`);
  }
  const monthColumns = head
    .map((name, index) => ({ month: excelMonth(name), index }))
    .filter((column) => column.month);
  if (!monthColumns.length) {
    throw new Error('targets file has no Excel month columns');
  }
  const byLine = {};
  const siteRows = { Site_PDT_Targets: [], Site_UPDT_Targets: [] };
  const buckets = {
    'Planned Downtime (Total)': {
      table: 'Site_PDT_Targets',
      column: 'PDT Target',
    },
    'Unplanned Downtime (Total)': {
      table: 'Site_UPDT_Targets',
      column: 'UPDT Target',
    },
  };
  for (const r of sheet.slice(1)) {
    const line = norm(r[head.indexOf('Line')]);
    const site = norm(r[head.indexOf('Site Name')]);
    const bucket = norm(r[head.indexOf('OEE Bucket')]);
    if (!line || !site || key(site) !== key(SITE) || !bucket) {
      continue;
    }
    const lineKey = key(line);
    for (const { month, index } of monthColumns) {
      const raw = r[index];
      const value = raw === '' || raw === undefined || raw === null
        ? null
        : Number(raw);
      if (value !== null && !Number.isFinite(value)) {
        throw new Error(`invalid target value: ${line} ${bucket} ${month}`);
      }
      byLine[lineKey] ??= {};
      byLine[lineKey][month] ??= {};
      if (value !== null) {
        byLine[lineKey][month][bucket] = value;
      }
      const spec = buckets[bucket];
      if (spec) {
        const monthText = `01/${month.slice(5, 7)}/${month.slice(0, 4)}`;
        const targetRow = {
          Site: SITE,
          Line: line,
          'OEE Bucket': bucket,
          Date: dayNumber(`${month}-01`),
          [spec.column]: value,
          'Volume Key': `${line} ${monthText}`,
          loaded_at: LOADED_AT,
        };
        siteRows[spec.table].push(targetRow);
      }
    }
  }
  return { byLine, siteRows };
}
const targetData = existsSync(TARGETS)
  ? readTargets(TARGETS)
  : { byLine: {}, siteRows: {} };
if (!existsSync(TARGETS)) {
  console.warn(`no target file at ${TARGETS}: report targets stay empty`);
}

// ---- Files and the Category sheets (French loss name -> Level 1 / 2 / 3 English) ----
const files = walk(ROOT)
  .filter((p) => /\/(\d{4})\/SAISIE OEE\/OEE [^/]+\.xlsm$/.test(p))
  .map((path) => {
    const parts = path.split('/');
    const year = parts.at(-3);
    const line = parts.at(-1).replace(/^OEE /, '').replace(/ - \d{4}\.xlsm$/, '');
    return { path, year, line, group: parts.at(-4), book: readXlsx(path) };
  });
const catOf = (book) =>
  new Map(
    (book.Category ?? []).slice(2).filter((r) => norm(r[0])).map((r) => [norm(r[0]), r.map(norm)]),
  );
const catByLine = {};
const catAll = new Map();
for (const f of files) {
  const c = catOf(f.book);
  if (c.size) {
    catByLine[key(f.line)] = c;
    for (const [k, v] of c) {
      if (!catAll.has(k)) {
        catAll.set(k, v);
      }
    }
  }
}
// Fallback when no Category row has the name (CUPIDON, DAISY, spare "Libre" columns).
const PREFIX = [
  [/^Dysf /, 'Minor stop', 'Unplanned losses'],
  [/^Pannes? /, 'Breakdown', 'Unplanned losses'],
  [/^Réglages? /, 'Adjustment', 'Unplanned losses'],
  [/^Orga/, 'Cleaning', 'Planned losses'],
  [/^Changement/, 'Changeover', 'Planned losses'],
  [/^Rupture/, 'Lack of Resources', 'Unplanned losses'],
  [/^Qualité/, 'Quality issue', 'Unplanned losses'],
  [/^Maintenance/, 'Planned maintenance', 'Planned losses'],
];
const notInCategory = new Map();
const MACHINE_LOSS = /^(Dysf|Pannes?|Réglages?) /;
const toEnglish = (s) => WORD_EN.reduce((t, [re, en]) => t.replace(re, en), s);
function levels(line, name) {
  const row = catByLine[key(line)]?.get(name) ?? catAll.get(name);
  if (row) {
    return { l3: toEnglish(row[1] || name), l2: row[3], l1: row[5], machine: MACHINE_LOSS.test(name), from: 'Category' };
  }
  notInCategory.set(name, (notInCategory.get(name) ?? 0) + 1);
  const p = PREFIX.find(([re]) => re.test(name)) ?? [null, 'Undefined', 'Unplanned losses'];
  const machine = p[0] !== null && p[2] === 'Unplanned losses' && MACHINE_LOSS.test(name);
  const part = machine ? name.replace(p[0], '') : name;
  const en = PART_EN[part];
  return { l3: en ?? part, l2: p[1], l1: p[2], machine, from: en ? 'our translation' : 'block rule, French kept' };
}

// ---- MASTERDATA (the reason tree of the SIH entry page): the English name of each loss ----
// Planned and unplanned blocks: Level 1 / Level 2 (EN, FR). Machine block: line, machine,
// type (Breakdown, Minor Stop, Adjustment), sub part. The workbook losses are per machine:
// the history gets the machine name, never the sub part. Group / sub group stay the Category
// ones (the EU classification); MASTERDATA gives the Level 3 name and the Equipment.
const mdReasons = [];
const mdMachines = {};
// Machine parts per line: { machine, machineFr, en, fr } (MASTERDATA Level 4).
const mdParts = {};
if (existsSync(MASTERDATA)) {
  for (const r of readXlsx(MASTERDATA).Downtime_updated.slice(2).map((x) => x.map(norm))) {
    for (const c of [0, 5]) {
      if (r[c]) {
        mdReasons.push({ l1: r[c], l1fr: r[c + 1], l2: r[c + 2], l2fr: r[c + 3] });
      }
    }
    if (r[10] && r[12] && r[16]) {
      const parts = (mdParts[key(r[10])] ??= []);
      if (!parts.some((p) => p.machine === r[12] && p.en === r[16])) {
        parts.push({ machine: r[12], machineFr: r[13], en: r[16], fr: r[17] });
      }
    }
    if (r[10] && r[12]) {
      const list = (mdMachines[key(r[10])] ??= []);
      if (!list.some((m) => m.en === r[12])) {
        list.push({ en: r[12], fr: r[13] });
      }
    }
  }
} else {
  console.warn(`no MASTERDATA at ${MASTERDATA}: loss names stay the Category ones`);
}
// Workbook English name (Category, without ZAC- / EXT-) -> MASTERDATA names with the same
// meaning; the first one that exists on the line is used. Our proposal: to confirm.
const SYNONYM = {
  'Filling machine': ['Filler'],
  Paletizer: ['Palletiser'],
  'Capping/Screwing machine': ['Capper / Screw Capper', 'Screw Capper'],
  'Screwing machine': ['Capper / Screw Capper', 'Screw Capper'],
  'Caps dispenser': ['Cap Feeder Bowl'],
  'Pumps dispenser': ['Pump Feeder Bowl'],
  'Pump dispenser': ['Pump Feeder Bowl'],
  Weigher: ['Checkweigher'],
  Weighter: ['Checkweigher', 'Case Checkweigher'],
  'Case Weigher': ['Case Checkweigher', 'Checkweigher'],
  'Bottle Weigher': ['Bottle Checkweigher'],
  'Tube dispenser': ['Tube Dispenser', 'Tubes dispenser'],
  'Bottle labeller': ['Labeller'],
  'Case labeller': ['Case Labeller'],
  'Bottle dater': ['Inkjet Printer'],
  'Tube dater': ['Inkjet Printer'],
  'Skillet dater': ['Inkjet Printer'],
  Dater: ['Inkjet Printer'],
  Laser: ['Laser Coder'],
  'Case packer part1': ['Case Erector'],
  'Case packer part2': ['Case Packer'],
  'Case packer part3': ['Case Sealer', 'Case Taper'],
  'Case Closer': ['Case Taper', 'Case Sealer'],
  'Skilleting machine': ['Skiletting Machine', 'Cartoner'],
  'Skiletting machine': ['Skiletting Machine', 'Cartoner'],
  'Spatula dispenser': ['Spatula Dispenser', 'Spatula Applicator'],
  'Coating dispenser': ['Coater'],
  'Mixing tank': ['Tank'],
  Pusher: ['Case Pusher'],
  'Refilling Materials': ['Refiling materials'],
  'Annual maintenance': ['Annual preventive maintenance'],
  'Monthly maintenance': ['Monthly preventive maintenance'],
  'Other maintenance': ['Other preventive maintenance'],
  'Planned actions': ['Planned maintenance action'],
  'Fire alarm': ['Evacuation'],
};
const synonymKeys = new Map(Object.entries(SYNONYM).map(([k, v]) => [key(k), v]));
const PART_PREFIX_FR = /^(Ext ZAC |ZAC - |ZAC )/i;
const PART_PREFIX_EN = /^(ZAC|EXT) ?- ?/i;
// Returns { name, l1, method } or null. Methods: same English name, same French name,
// name contained (shortest MASTERDATA name of 5+ letters inside ours: to confirm).
function masterdata(line, name, lv) {
  if (lv.machine) {
    const list = mdMachines[key(line)] ?? [];
    const fr = key(name.replace(MACHINE_LOSS, '').replace(PART_PREFIX_FR, ''));
    const en = key(lv.l3.replace(PART_PREFIX_EN, ''));
    const hit = list.find((m) => key(m.en) === en) ?? list.find((m) => key(m.fr) === fr);
    if (hit) {
      return { name: hit.en, l1: lv.l2, method: key(hit.en) === en ? 'same English name' : 'same French name' };
    }
    const syn = (synonymKeys.get(en) ?? []).map((s) => list.find((m) => m.en === s)).find(Boolean);
    if (syn) {
      return { name: syn.en, l1: lv.l2, method: 'synonym, to confirm' };
    }
    const inside = list
      .filter((m) => (key(m.fr).length >= 5 && fr.includes(key(m.fr))) || (key(m.en).length >= 5 && en.includes(key(m.en))))
      .sort((a, b) => b.en.length - a.en.length)[0];
    return inside ? { name: inside.en, l1: lv.l2, method: 'name contained, to confirm' } : null;
  }
  const label = (m) => m.l2 || m.l1;
  const hit =
    mdReasons.find((m) => key(label(m)) === key(lv.l3)) ??
    mdReasons.find((m) => key(m.l2 ? m.l2fr : m.l1fr) === key(name));
  if (hit) {
    return { name: label(hit), l1: hit.l1, method: key(label(hit)) === key(lv.l3) ? 'same English name' : 'same French name' };
  }
  const syn = (synonymKeys.get(key(lv.l3)) ?? []).map((s) => mdReasons.find((m) => label(m) === s)).find(Boolean);
  return syn ? { name: label(syn), l1: syn.l1, method: 'synonym, to confirm' } : null;
}
// ---- Machine part (MASTERDATA Level 4) of a machine loss column ----
// The part words are the French column name after the machine
// (Dysf ETUYEUSE - Introduction Tubes -> Introduction Tubes).
// Methods: exact part, part name contained (to confirm). No part (machine only): the column
// names the machine only, several parts match, the case is unsure, or nothing matches.
// Site answers win over the rule: PART_ANSWER['LINE|column'] = part EN, or null = machine
// only. Fill it from the review sheet "4 Machine part" and rerun to a new folder.
const PART_ANSWER = {};
// Asked to the site (2026-11-06), kept machine only until answered: two parts in one
// column, or only one of the two named parts is in MASTERDATA.
const PART_UNSURE = [
  /Chauffe \/ Scellage/i,
  /Introduction Tubes \/ Spatules/i,
  /Débordement Crème \/ Niveau cuve/i,
];
const PART_PREFIX = /^(Dysf|Pannes?|Réglages?) (Ext ZAC |ZAC - |ZAC )?/i;
const partKey = (s) => key(s).replace(/[^A-Z0-9]/g, '');
function machinePart(line, column, machine) {
  const mine = (mdParts[key(line)] ?? []).filter((p) => p.machine === machine);
  const answer = PART_ANSWER[`${line}|${column}`];
  if (answer !== undefined) {
    const hit = mine.find((p) => p.en === answer) ?? null;
    return { part: hit, method: answer === null ? 'site: machine only' : 'site answer' };
  }
  if (!mine.length) {
    return { part: null, method: 'no machine in MASTERDATA' };
  }
  const rest = column.replace(PART_PREFIX, '');
  const machineFr = mine[0].machineFr ?? '';
  let words = rest;
  if (machineFr && partKey(rest).startsWith(partKey(machineFr))) {
    words = rest.slice(machineFr.length);
  }
  // One letter left is a plural of the machine name (BOL POMPES vs Bol pompe): no part.
  const w = partKey(words).length <= 1 ? '' : partKey(words);
  if (!w) {
    return { part: null, method: 'machine only (column names the machine)' };
  }
  const exact = mine.filter((p) => partKey(p.fr) === w || partKey(p.en) === w);
  const inside = mine.filter((p) => {
    const f = partKey(p.fr);
    return (f.length >= 4 && w.includes(f)) || (w.length >= 5 && f.includes(w));
  });
  const found = exact.length ? exact : inside;
  if (found.length > 1) {
    return { part: null, method: 'no part: several parts match', candidates: found };
  }
  if (found.length === 1 && PART_UNSURE.some((re) => re.test(column))) {
    return { part: null, method: 'no part: unsure, asked to the site', candidates: found };
  }
  if (found.length === 1) {
    const method = exact.length ? 'exact part' : 'part name contained, to confirm';
    return { part: found[0], method };
  }
  return { part: null, method: 'no part found' };
}
// ---- The shift of a day's losses (user decision 2026-11-06) ----
// Base holds day totals, so the losses go on the plan shift with the most Temps that day,
// ties to the earliest (Day, Afternoon, Night). Time = start of the shift type with the
// most Temps inside that shift. No plan slot: Day at 05:00.
const SHIFT_ORDER = ['Day', 'Afternoon', 'Night'];
const NO_PLAN_SHIFT = { name: 'Day', start: SHIFT_START['Semaine Matin'] * 3600000 };
function shiftOfLosses(slots) {
  if (!slots.length) {
    return NO_PLAN_SHIFT;
  }
  const byShift = {};
  const byType = {};
  for (const s of slots) {
    byShift[SHIFTS[s.shift]] = (byShift[SHIFTS[s.shift]] ?? 0) + s.time;
    byType[s.shift] = (byType[s.shift] ?? 0) + s.time;
  }
  const name = SHIFT_ORDER.filter((n) => n in byShift).reduce((a, b) => (byShift[b] > byShift[a] ? b : a));
  const type = Object.keys(byType)
    .filter((t) => SHIFTS[t] === name)
    .reduce((a, b) => (byType[b] > byType[a] ? b : a));
  return { name, start: SHIFT_START[type] * 3600000 };
}
// One entry per line and loss column that holds minutes: what the conversion used.
const lossMap = new Map();

// ---- One Base row -> rows of the three tables ----
const out = { Plan_OPT_EU: {}, Time_Utilisation_EU: {}, Daily_Losses_EU: {} };
const add = (table, iso, row) => {
  (out[table][iso.slice(0, 7)] ??= []).push(row);
};
const checks = [['file', 'date', 'rule', 'detail']];
const dupes = [];
const duplicateDetails = [];
const days = [];
const sum = { days: 0, plan: 0, util: 0, loss: 0 };

for (const f of files.filter((x) => YEARS.includes(x.year))) {
  const base = f.book.Base;
  const h = base[0].map(norm).map((n) => n.replace('Week-end', 'Weekend'));
  const col = (n) => h.indexOf(n);
  const v = (r, n) => r[col(n)];
  const lossEnd = h.findIndex((n) => n.startsWith('Code PF1'));
  const lossCols = [col('NR')];
  for (let i = 8; i < lossEnd; i += 1) {
    if (!/^Nbre/i.test(h[i])) {
      lossCols.push(i);
    }
  }
  // The day is ANNEE / MOIS / JOUR (the stored Date is off by a day on some rows).
  // Newest saving wins when a day was entered twice (rows are newest on top).
  const rows = base.slice(2).filter((r) => num(v(r, 'ANNEE')) > 2000 && num(v(r, 'JOUR')));
  const seen = new Map();
  for (const r of rows) {
    const pad = (n) => String(num(n)).padStart(2, '0');
    const iso = `${num(v(r, 'ANNEE'))}-${pad(v(r, 'MOIS'))}-${pad(v(r, 'JOUR'))}`;
    const savedValue = v(r, 'Date et heure de la saisie');
    const saved = num(savedValue);
    if (seen.has(iso)) {
      const previous = seen.get(iso);
      dupes.push(`${f.line} ${iso}`);
      const width = Math.max(previous.r.length, r.length, h.length);
      const differingColumns = [];
      for (let i = 0; i < width; i += 1) {
        if (String(previous.r[i] ?? '') !== String(r[i] ?? '')) {
          differingColumns.push(norm(base[0][i]) || `Column ${i + 1}`);
        }
      }
      const saveText = (value) => {
        const serial = Number(value);
        if (value === '' || value === undefined || !Number.isFinite(serial)) {
          return String(value ?? '');
        }
        return new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
          .toISOString()
          .replace('T', ' ')
          .replace(/\.000Z$/, '');
      };
      duplicateDetails.push({
        file: f.path.slice(ROOT.length + 1),
        date: iso,
        savingTime1: saveText(previous.savedValue),
        savingTime2: saveText(savedValue),
        differingColumns: differingColumns.join('; ') || 'same',
      });
      if (saved <= previous.saved) {
        continue;
      }
    }
    seen.set(iso, { r, saved, savedValue });
  }
  const info = MACHINE_INFO[key(f.line)] ?? {};
  const machine = info.name ?? f.line;
  const unique = `${machine}-${SITE}`;
  const machineCols = { Dept: info.dept ?? null, Area: info.area ?? null, 'Product Type': info.type ?? null };

  for (const [iso, { r }] of seen) {
    sum.days += 1;
    const month = iso.slice(0, 7);
    const monthTargets = targetData.byLine[key(machine)]?.[month] ?? {};
    const oeeTarget = monthTargets['% OEE'] ?? null;
    const top = num(v(r, 'TOP'));
    const tor = num(v(r, 'TOR'));
    const tu = num(v(r, 'TU'));
    const nr = num(v(r, 'NR'));
    const closed = num(v(r, 'Total Temps Fermeture'));

    // Product slots: 5 shift types x PF1 to PF4.
    const slots = [];
    for (const shift of Object.keys(SHIFTS)) {
      for (let k = 1; k <= 4; k += 1) {
        const f2 = (n) => v(r, `${n} PF${k} ${shift}`);
        const slot = {
          shift,
          code: norm(f2('Code')),
          name: norm(f2('Nom')),
          time: num(f2('Temps')),
          volume: num(f2('Volume')),
          waste: num(f2('Déchets')),
          speed: num(f2('Vitesse')),
        };
        if (slot.code || slot.time || slot.volume) {
          slots.push(slot);
        }
      }
    }
    let capacityDay = 0;
    for (const s of slots) {
      const good = s.volume;
      const capacity = s.speed * s.time;
      capacityDay += capacity;
      add('Plan_OPT_EU', iso, {
        Date: dayNumber(iso),
        AreaName: AREA[f.group] ?? f.group,
        MachineName: machine,
        ShiftName: SHIFTS[s.shift],
        PartName: s.name || s.code,
        'Good Parts': good,
        Capacity: capacity,
        'Total Time': Math.trunc(s.time),
        'Planned OpT': Math.trunc(s.time),
        'OEE Time': s.speed ? Math.trunc(good / s.speed) : null,
        'Downtime Units': capacity - good,
        SiteName: SITE,
        'Unique Machine Name': unique,
        'Product Key': `${unique} ${s.name || s.code}`,
        'UPDT Target': monthTargets['Unplanned Downtime (Total)'] ?? null,
        'PDT Target': monthTargets['Planned Downtime (Total)'] ?? null,
        // Percent like the Glidepaths of the other sites (61.3, not 0.613).
        'OEE Target': oeeTarget === null ? null : Math.round(oeeTarget * 1000) / 10,
        ...machineCols,
        'Defect Parts': s.waste,
        OEE: capacity ? Math.round((good / capacity) * 1000) / 1000 : null,
        'Shift Colour': null,
        ShiftStartTime: SHIFT_START[s.shift] * 3600000,
        // Hull: Target equals Capacity (export column, 2026-09 checked).
        Target: capacity,
        'Targets Key': `${machine} 01/${iso.slice(5, 7)}/${iso.slice(0, 4)}`,
        ...NO_FORMAT,
        'Data Source': DATA_SOURCE,
        'In EU Report': true,
        source_hours: null,
        loaded_at: LOADED_AT,
      });
      sum.plan += 1;
    }

    add('Time_Utilisation_EU', iso, {
      Date: dayNumber(iso),
      MachineName: machine,
      'OEE Time Total': tu,
      'Total Time Total': tor,
      'Planned OPT Total': PLANNED_OPT_FROM === 'TOP' ? top : tor,
      SiteName: SITE,
      'Unique Machine Name': unique,
      'All Time': 1440,
      ...machineCols,
      'Data Source': DATA_SOURCE,
      'In EU Report': true,
      loaded_at: LOADED_AT,
    });
    sum.util += 1;

    // Losses: one row per loss column with minutes; speed of the product with most time.
    const main = slots.reduce((a, s) => (s.time > (a?.time ?? -1) ? s : a), null);
    const lossShift = shiftOfLosses(slots);
    let lossMinutes = 0;
    for (const i of lossCols) {
      const minutes = num(r[i]);
      lossMinutes += minutes;
      if (minutes < 0) {
        checks.push([f.path.slice(ROOT.length + 1), iso, 'negative loss not loaded', `${h[i]} ${minutes}`]);
      }
      if (minutes <= 0) {
        continue;
      }
      const lv = levels(machine, h[i]);
      const group = GROUP[lv.l1] ?? lv.l1;
      const sub = SUB[lv.l2] ?? lv.l2;
      const target = targetData.byLine[key(machine)]?.[iso.slice(0, 7)]?.[sub] ?? null;
      const md = masterdata(machine, h[i], lv);
      const equipment = md?.name ?? lv.l3;
      const mp = lv.machine ? machinePart(machine, h[i], equipment) : null;
      const l3 = mp?.part ? `${equipment} - ${mp.part.en}` : equipment;
      const mapKey = `${machine}|${h[i]}`;
      const entry = lossMap.get(mapKey) ?? {
        line: machine,
        group: AREA[f.group] ?? f.group,
        column: h[i],
        categoryL1: lv.l1,
        categoryL2: lv.l2,
        categoryL3: lv.l3,
        from: lv.from,
        machineLoss: lv.machine,
        mdName: md?.name ?? null,
        mdLevel1: md?.l1 ?? null,
        mdMethod: md?.method ?? (mdMachines[key(machine)] || !lv.machine ? 'no match' : 'line not in MASTERDATA'),
        OEELossLvl3Group: group,
        OEELossLvl3SubGroup: sub,
        OEELossLvl3Desc: l3,
        Equipment: lv.machine ? equipment : 'Unclassed',
        partEn: mp?.part?.en ?? null,
        partFr: mp?.part?.fr ?? null,
        partMethod: mp?.method ?? null,
        partCandidates: (mp?.candidates ?? []).map((p) => p.en).join(' | ') || null,
        rows: 0,
        minutes: 0,
      };
      entry.rows += 1;
      entry.minutes += minutes;
      lossMap.set(mapKey, entry);
      add('Daily_Losses_EU', iso, {
        Date: dayNumber(iso),
        Time: lossShift.start,
        MachineName: machine,
        PartName: null,
        'Shift Time': lossShift.name,
        ShiftName: lossShift.name,
        OEELossLvl3Group: group,
        OEELossLvl3SubGroup: sub,
        OEELossLvl3Desc: l3,
        Duration: Math.round(minutes),
        'Shift colour': null,
        SiteName: SITE,
        'Unique Machine Name': unique,
        'Breakdown Types': sub,
        ShiftStartDate: dayNumber(iso),
        Comment: null,
        'Product Key': null,
        'Volume Key': `${dmy(iso)} ${machine} ${group} ${sub} ${l3}`,
        'Loss Units': main?.speed ? main.speed * minutes : null,
        'Time in Mins': minutes,
        'Equipment Loss Key': `${machine} ${l3}`,
        Equipment: lv.machine ? equipment : 'Unclassed',
        'Lvl 3 Loss Name': l3,
        'Loss Target Key': `${unique} ${sub} 01/${iso.slice(5, 7)}/${iso.slice(0, 4)}`,
        Value: null,
        'Volume Total': capacityDay,
        'Loss Final Level': l3,
        ...machineCols,
        'Data Source': DATA_SOURCE,
        'In EU Report': true,
        target,
        'Batch ID': null,
        ...NO_FORMAT,
        comment_count: null,
        loaded_at: LOADED_AT,
      });
      sum.loss += 1;
    }

    // The rules of the entry form (docs/chartres-source-files.md 2b): rows are loaded, failures listed.
    const slotTime = slots.reduce((s, x) => s + x.time, 0);
    const fail = (rule, detail) => checks.push([f.path.slice(ROOT.length + 1), iso, rule, detail]);
    if (tor !== top - closed) fail('TOR = TOP - not counted', `${tor} vs ${top} - ${closed}`);
    if (tu + lossMinutes !== tor) fail('TU + NR + losses = TOR', `${tu} + ${lossMinutes} vs ${tor} (NR ${nr})`);
    if (slotTime !== tor) fail('sum of product Temps = TOR', `${slotTime} vs ${tor}`);
    if (Math.round(num(v(r, 'OEE')) * tor) !== tu) fail('TU = round(OEE x TOR)', `${tu} vs ${num(v(r, 'OEE'))} x ${tor}`);
    // One line per day for the review (scripts/chartres-review.js): the Base row and our totals.
    days.push({
      file: f.path.slice(ROOT.length + 1),
      baseRow: base.indexOf(r),
      line: machine,
      group: AREA[f.group] ?? f.group,
      date: iso,
      TOP: top,
      TOR: tor,
      TU: tu,
      NR: nr,
      closed,
      oeeBase: num(v(r, 'OEE')),
      products: slots.length,
      slotTime,
      lossMinutes,
      lossLoaded: lossCols.reduce((s, i) => s + Math.max(num(r[i]), 0), 0),
      goodParts: slots.reduce((s, x) => s + x.volume, 0),
      capacity: capacityDay,
      waste: slots.reduce((s, x) => s + x.waste, 0),
    });
  }
}

// ---- Write ----
// The schemas of the Hull / Nottingham files (step 9): one folder per table must have one
// schema, the dashboard extract fails on a file whose types differ.
const schemas = {
  Plan_OPT_EU: pbiPlanSchema,
  Time_Utilisation_EU: reportUtilSchema,
  Daily_Losses_EU: pbiLossSchema,
  Site_PDT_Targets: reportPdtSchema,
  Site_UPDT_Targets: reportUpdtSchema,
};
let fileCount = 0;
for (const [table, months] of Object.entries(out)) {
  const names = schemas[table].map(([n]) => n);
  for (const [month, rows] of Object.entries(months)) {
    for (const row of rows) {
      const extra = Object.keys(row).filter((n) => !names.includes(n));
      const missing = names.filter((n) => !(n in row));
      if (extra.length || missing.length) {
        throw new Error(`${table}: columns differ from the schema: extra ${extra} missing ${missing}`);
      }
    }
    const path = join(OUT, 'stage', table, `site=${SITE}`, `${table}_${month}_${FILE_SUFFIX}.json`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ schema: schemas[table], rows }));
    fileCount += 1;
  }
}
for (const [table, rows] of Object.entries(targetData.siteRows)) {
  const path = join(OUT, 'stage', table, `site=${SITE}`, `${table}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ schema: schemas[table], rows }));
  fileCount += 1;
}
const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
writeFileSync(join(OUT, 'checks.csv'), `${csv(checks)}\n`);
const duplicateRows = [
  ['file', 'date', 'saving time 1', 'saving time 2', 'differing Base columns'],
  ...duplicateDetails.map((entry) => [
    entry.file,
    entry.date,
    entry.savingTime1,
    entry.savingTime2,
    entry.differingColumns,
  ]),
];
writeFileSync(join(OUT, 'duplicates.csv'), `${csv(duplicateRows)}\n`);
const lossList = [...lossMap.values()];
writeFileSync(join(OUT, 'loss-map.json'), JSON.stringify(lossList, null, 1));
writeFileSync(join(OUT, 'days.json'), JSON.stringify({ root: ROOT, dupes, days }));
const byMethod = {};
for (const e of lossList) {
  byMethod[e.mdMethod] ??= { names: 0, rows: 0 };
  byMethod[e.mdMethod].names += 1;
  byMethod[e.mdMethod].rows += e.rows;
}
console.log(`MASTERDATA match (line x loss column, loss rows): ${JSON.stringify(byMethod)}`);
console.log(`days ${sum.days}, rows: plan ${sum.plan}, time ${sum.util}, losses ${sum.loss}; ${fileCount} files in ${OUT}/stage`);
console.log(`form rules failed: ${checks.length - 1} (see ${OUT}/checks.csv)`);
console.log(`dates entered twice (newest saving kept): ${dupes.length} ${dupes.join(', ')}`);
console.log(`loss names not in any Category sheet (block rule used): ${[...notInCategory.keys()].filter((n) => !/Libre/.test(n)).length} named, plus spare "Libre" columns`);
const targetLines = [...new Set(Object.keys(targetData.byLine))];
const workbookLines = [...new Map(files.map((file) => [key(file.line), file.line])).values()];
const targetLinesWithoutWorkbook = targetLines.filter((lineKey) =>
  !workbookLines.some((line) => key(line) === lineKey));
const workbookLinesWithoutTargets = workbookLines.filter((line) =>
  !targetLines.includes(key(line)));
const targetedLines = workbookLines.filter((line) =>
  Object.values(targetData.byLine[key(line)] ?? {})
    .some((month) => Number.isFinite(month['% OEE'])));
console.log(`target lines without workbooks: ${targetLinesWithoutWorkbook.join(', ') || 'none'} (JUPITER is expected)`);
console.log(`workbook lines without target rows: ${workbookLinesWithoutTargets.join(', ') || 'none'} (CUPIDON and DAISY have no target rows)`);
console.log(`OEE target lines: ${targetedLines.length} with month values in 2025-2026`);
console.log(`duplicate days with differing Base columns: ${duplicateDetails.filter((entry) => entry.differingColumns !== 'same').length}`);
