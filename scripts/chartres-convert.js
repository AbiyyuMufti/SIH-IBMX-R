// Converts the Chartres OEE workbooks (sheet Base, 2025 and 2026) into the three
// report tables Plan_OPT_EU, Time_Utilisation_EU and Daily_Losses_EU, with the
// columns and types of scripts/lib-pbi-report-schemas.js and Data Source "Excel".
// Rules and choices: docs/chartres-convert.md. Read only on the workbooks.
// Usage: node scripts/chartres-convert.js [downloads/01 SITE Chartres] [out=<new folder>]
//          [targets=<Target 2026.xlsx>] [masterdata=<MASTERDATA.xlsx>] [years=2025,2026]
// Writes <out>/stage/<table>/site=Chartres/<table>_<YYYY-MM>_excel.json
// ({schema, rows}), <out>/checks.csv (days that fail a rule of the entry form) and
// <out>/loss-map.json (each loss column -> the names used, the MASTERDATA match),
// then `python -I scripts/helper-chartres-write-parquet.py <out>` writes the parquet
// files under <out>/report/ (the lake layout of docs/report-config.md).
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readXlsx } from './lib-office.js';
import { reportPlanSchema, reportUtilSchema, reportLossSchema } from './lib-pbi-report-schemas.js';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)),
);
const ROOT = process.argv.slice(2).find((a) => !a.includes('=')) ?? 'downloads/01 SITE Chartres';
const OUT = args.out ?? 'downloads/chartres-convert/run1';
const TARGETS = args.targets ?? join(ROOT, 'Copie de Target 2026.xlsx');
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
// A machine with two product types (ZEUS, APOLLON) shows the first: the report tables
// have one row per machine. name = MachineName of the site file, used in every row.
const MACHINE_INFO = {
  NEPTUNE: { name: 'NEPTUNE', dept: 'Packaging - SKIN CARE', area: 'SKIN CARE', type: 'Bottle Cap' },
  ZEUS: { name: 'ZEUS', dept: 'Packaging - SKIN CARE', area: 'SKIN CARE', type: 'No touch' },
  APOLLON: { name: 'APOLLON', dept: 'Packaging - SKIN CARE', area: 'SKIN CARE', type: 'Bottle Cap' },
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
const LOADED_AT = Date.now();

if (existsSync(join(OUT, 'stage'))) {
  console.error(`${OUT}/stage exists: give a new out= folder`);
  process.exit(1);
}

// ---- Targets: one OEE target per line and month (Target 2026, also used for 2025) ----
function readTargets(path) {
  const sheet = readXlsx(path)['OEE TARGET'];
  const head = sheet[0].map(norm);
  const byLine = {};
  for (const r of sheet.slice(1)) {
    const month = num(r[1]);
    if (!month) {
      continue;
    }
    head.forEach((h, i) => {
      if (i > 2 && r[i] !== '' && r[i] !== undefined) {
        byLine[key(h)] ??= {};
        byLine[key(h)][month] ??= Number(r[i]);
      }
    });
  }
  return byLine;
}
const targets = existsSync(TARGETS) ? readTargets(TARGETS) : {};
if (!existsSync(TARGETS)) {
  console.warn(`no target file at ${TARGETS}: OEE Target stays empty`);
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
if (existsSync(MASTERDATA)) {
  for (const r of readXlsx(MASTERDATA).Downtime_updated.slice(2).map((x) => x.map(norm))) {
    for (const c of [0, 5]) {
      if (r[c]) {
        mdReasons.push({ l1: r[c], l1fr: r[c + 1], l2: r[c + 2], l2fr: r[c + 3] });
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
// One entry per line and loss column that holds minutes: what the conversion used.
const lossMap = new Map();

// ---- One Base row -> rows of the three tables ----
const out = { Plan_OPT_EU: {}, Time_Utilisation_EU: {}, Daily_Losses_EU: {} };
const add = (table, iso, row) => {
  (out[table][iso.slice(0, 7)] ??= []).push(row);
};
const checks = [['file', 'date', 'rule', 'detail']];
const dupes = [];
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
  // NON TISSE: waste per machine and shift ("Déchets <machine> <shift>"), not per product.
  const machineWaste = h
    .map((n, i) => [n, i])
    .filter(([n]) => n.startsWith('Déchets ') && !/^Déchets PF\d/.test(n));
  // The day is ANNEE / MOIS / JOUR (the stored Date is off by a day on some rows).
  // Newest saving wins when a day was entered twice (rows are newest on top).
  const rows = base.slice(2).filter((r) => num(v(r, 'ANNEE')) > 2000 && num(v(r, 'JOUR')));
  const seen = new Map();
  for (const r of rows) {
    const pad = (n) => String(num(n)).padStart(2, '0');
    const iso = `${num(v(r, 'ANNEE'))}-${pad(v(r, 'MOIS'))}-${pad(v(r, 'JOUR'))}`;
    const saved = num(v(r, 'Date et heure de la saisie'));
    if (seen.has(iso)) {
      dupes.push(`${f.line} ${iso}`);
      if (saved <= seen.get(iso).saved) {
        continue;
      }
    }
    seen.set(iso, { r, saved });
  }
  const info = MACHINE_INFO[key(f.line)] ?? {};
  const machine = info.name ?? f.line;
  const unique = `${machine}-${SITE}`;
  const machineCols = { Dept: info.dept ?? null, Area: info.area ?? null, 'Product Type': info.type ?? null };

  for (const [iso, { r }] of seen) {
    sum.days += 1;
    const month = Number(iso.slice(5, 7));
    const oeeTarget = targets[key(machine)]?.[month] ?? null;
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
    // Machine waste: per shift to the slots of that shift, the rest ("Libre") to all, by volume.
    const spread = (waste, list) => {
      const vol = list.reduce((s, x) => s + x.volume, 0);
      for (const x of list) {
        x.waste += vol ? (waste * x.volume) / vol : 0;
      }
    };
    for (const [n, i] of machineWaste) {
      const w = num(r[i]);
      if (!w) {
        continue;
      }
      const shift = Object.keys(SHIFTS).find((s) => n.endsWith(` ${s}`));
      spread(w, shift ? slots.filter((x) => x.shift === shift) : slots);
    }

    let capacityDay = 0;
    for (const s of slots) {
      const good = Math.round(s.volume - s.waste);
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
        'UPDT Target': null,
        'PDT Target': null,
        'OEE Target': oeeTarget,
        ...machineCols,
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
      const md = masterdata(machine, h[i], lv);
      const l3 = md?.name ?? lv.l3;
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
        Equipment: lv.machine ? l3 : 'Unclassed',
        rows: 0,
        minutes: 0,
      };
      entry.rows += 1;
      entry.minutes += minutes;
      lossMap.set(mapKey, entry);
      add('Daily_Losses_EU', iso, {
        Date: dayNumber(iso),
        Time: null,
        MachineName: machine,
        PartName: null,
        'Shift Time': null,
        ShiftName: null,
        OEELossLvl3Group: group,
        OEELossLvl3SubGroup: sub,
        OEELossLvl3Desc: l3,
        Duration: minutes * 60000,
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
        Equipment: lv.machine ? l3 : 'Unclassed',
        'Lvl 3 Loss Name': l3,
        'Loss Target Key': `${unique} ${sub} 01/${iso.slice(5, 7)}/${iso.slice(0, 4)}`,
        Value: null,
        'Volume Total': capacityDay,
        'Loss Final Level': l3,
        ...machineCols,
        'Data Source': DATA_SOURCE,
        'In EU Report': true,
        target: null,
        batch_id: null,
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
      goodParts: slots.reduce((s, x) => s + Math.round(x.volume - x.waste), 0),
      capacity: capacityDay,
      waste: slots.reduce((s, x) => s + x.waste, 0),
    });
  }
}

// ---- Write ----
const schemas = { Plan_OPT_EU: reportPlanSchema, Time_Utilisation_EU: reportUtilSchema, Daily_Losses_EU: reportLossSchema };
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
const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
writeFileSync(join(OUT, 'checks.csv'), `${csv(checks)}\n`);
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
console.log(`lines without an OEE target: ${[...new Set(files.map((x) => x.line))].filter((l) => !targets[key(l)]).join(', ') || 'none'}`);
