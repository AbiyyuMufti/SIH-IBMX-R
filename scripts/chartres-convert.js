// Converts the Chartres OEE workbooks (sheet Base, 2025 and 2026) into the three
// report tables Plan_OPT_EU, Time_Utilisation_EU and Daily_Losses_EU, with the
// columns and types of scripts/lib-pbi-report-schemas.js and Data Source "Excel".
// Rules and choices: docs/chartres-convert.md. Read only on the workbooks.
// Usage: node scripts/chartres-convert.js [downloads/Chartres] [out=<new folder>]
//          [targets=<Target 2026.xlsx>] [years=2025,2026]
// Writes <out>/stage/<table>/site=Chartres/<table>_<YYYY-MM>_excel.json
// ({schema, rows}) and <out>/checks.csv (days that fail a rule of the entry form),
// then `python -I scripts/helper-chartres-write-parquet.py <out>` writes the parquet
// files under <out>/report/ (the lake layout of docs/report-config.md).
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readXlsx } from './lib-office.js';
import { reportPlanSchema, reportUtilSchema, reportLossSchema } from './lib-pbi-report-schemas.js';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)),
);
const ROOT = process.argv.slice(2).find((a) => !a.includes('=')) ?? 'downloads/Chartres';
const OUT = args.out ?? 'downloads/chartres-convert/run1';
const TARGETS = args.targets ?? 'downloads/Copie de Target 2026.xlsx';
const YEARS = (args.years ?? '2025,2026').split(',');

// Settings (docs/chartres-convert.md, open decisions of docs/chartres-source-files.md section 5).
const SITE = 'Chartres';
const DATA_SOURCE = 'Excel';
const FILE_SUFFIX = 'excel';
// Folder of the group -> AreaName (the names of the macro export and of the target file).
const AREA = { 'CREAM Chartres': 'CREAM', 'NON TISSE': 'NON WOVEN', 'SKIN CARE': 'SKIN CARE' };
// Chartres shift type -> report shift name.
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
// Machine Names for Chartres do not exist yet: Dept, Area, Product Type stay empty.
const MACHINE_INFO = {};

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
function levels(line, name) {
  const row = catByLine[key(line)]?.get(name) ?? catAll.get(name);
  if (row) {
    return { l3: row[1] || name, l2: row[3], l1: row[5], machine: /^(Dysf|Pannes?|Réglages?) /.test(name) };
  }
  notInCategory.set(name, (notInCategory.get(name) ?? 0) + 1);
  const p = PREFIX.find(([re]) => re.test(name)) ?? [null, 'Undefined', 'Unplanned losses'];
  const machine = p[0] !== null && p[2] === 'Unplanned losses' && /^(Dysf|Pannes?|Réglages?) /.test(name);
  return { l3: machine ? name.replace(p[0], '') : name, l2: p[1], l1: p[2], machine };
}

// ---- One Base row -> rows of the three tables ----
const out = { Plan_OPT_EU: {}, Time_Utilisation_EU: {}, Daily_Losses_EU: {} };
const add = (table, iso, row) => {
  (out[table][iso.slice(0, 7)] ??= []).push(row);
};
const checks = [['file', 'date', 'rule', 'detail']];
const dupes = [];
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
  const machine = f.line;
  const unique = `${machine}-${SITE}`;
  const info = MACHINE_INFO[key(machine)] ?? {};
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
      add('Daily_Losses_EU', iso, {
        Date: dayNumber(iso),
        Time: null,
        MachineName: machine,
        PartName: null,
        'Shift Time': null,
        ShiftName: null,
        OEELossLvl3Group: group,
        OEELossLvl3SubGroup: sub,
        OEELossLvl3Desc: lv.l3,
        Duration: minutes * 60000,
        SiteName: SITE,
        'Unique Machine Name': unique,
        'Breakdown Types': sub,
        ShiftStartDate: dayNumber(iso),
        Comment: null,
        'Product Key': null,
        'Volume Key': `${dmy(iso)} ${machine} ${group} ${sub} ${lv.l3}`,
        'Loss Units': main?.speed ? main.speed * minutes : null,
        'Time in Mins': minutes,
        'Equipment Loss Key': `${machine} ${lv.l3}`,
        Equipment: lv.machine ? lv.l3 : 'Unclassed',
        'Lvl 3 Loss Name': lv.l3,
        'Loss Target Key': `${unique} ${sub} 01/${iso.slice(5, 7)}/${iso.slice(0, 4)}`,
        Value: null,
        'Volume Total': capacityDay,
        'Loss Final Level': lv.l3,
        ...machineCols,
        'Data Source': DATA_SOURCE,
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
console.log(`days ${sum.days}, rows: plan ${sum.plan}, time ${sum.util}, losses ${sum.loss}; ${fileCount} files in ${OUT}/stage`);
console.log(`form rules failed: ${checks.length - 1} (see ${OUT}/checks.csv)`);
console.log(`dates entered twice (newest saving kept): ${dupes.length} ${dupes.join(', ')}`);
console.log(`loss names not in any Category sheet (block rule used): ${[...notInCategory.keys()].filter((n) => !/Libre/.test(n)).length} named, plus spare "Libre" columns`);
console.log(`lines without an OEE target: ${[...new Set(files.map((x) => x.line))].filter((l) => !targets[key(l)]).join(', ') || 'none'}`);
