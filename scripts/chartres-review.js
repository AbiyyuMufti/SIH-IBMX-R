// Builds the review of one run of scripts/chartres-convert.js for the site (Chartres).
// Two Excel sheets for the site: Loss names to check (only the names that need an answer,
// with the MASTERDATA names to choose from) and Questions. The example day is kept in
// review.example for scripts/chartres-explain-html.js (not in the Excel).
// Usage: node scripts/chartres-review.js <out of chartres-convert> [day=LINE@YYYY-MM-DD]
// Writes <out>/review.json ({sheets, example}), then
// `python -I scripts/helper-chartres-review-xlsx.py <out>/review.json <xlsx>` writes the Excel.
// Reads the run files and, for the example day only, the workbook row (no macro run).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsx } from './lib-office.js';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)),
);
const OUT = process.argv.slice(2).find((a) => !a.includes('='));
if (!OUT) {
  console.error('usage: node scripts/chartres-review.js <out folder of chartres-convert>');
  process.exit(1);
}
// The example: the latest day of this line that passes every rule of the entry form.
const EXAMPLE_LINE = 'APOLLON';
// Shift types of the workbook in the order of the product blocks.
const SHIFT_TYPES = ['Semaine Matin', 'Semaine Après Midi', 'Semaine Nuit', 'Weekend Matin', 'Weekend Nuit'];

const { root, dupes, days } = JSON.parse(readFileSync(join(OUT, 'days.json'), 'utf8'));
const lossMap = JSON.parse(readFileSync(join(OUT, 'loss-map.json'), 'utf8'));
const checks = readFileSync(join(OUT, 'checks.csv'), 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((l) => [...l.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"')));
const failsOf = new Map();
for (const [file, date, rule, detail] of checks) {
  const k = `${file}|${date}`;
  failsOf.set(k, [...(failsOf.get(k) ?? []), `${rule}: ${detail}`]);
}
const fails = (d) => failsOf.get(`${d.file}|${d.date}`) ?? [];
const ratio = (a, b) => (b ? a / b : null);
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const num = (v) => (v === '' || v === undefined || v === null ? 0 : Number(v) || 0);
const pct = (x) => `${(x * 100).toFixed(1)} %`;
const total = (list, pick) => list.reduce((t, x) => t + num(pick(x)), 0);
const stage = (table, month) =>
  JSON.parse(readFileSync(join(OUT, 'stage', table, 'site=Chartres', `${table}_${month}_excel.json`), 'utf8')).rows;
const isoOf = (dayNo) => new Date(dayNo * 86400000).toISOString().slice(0, 10);
const MACHINE_LOSS = /^(Dysf|Pannes?|Réglages?) /;
const sure = (e) => e.mdMethod.startsWith('same');
const latest = (list) => [...list].sort((a, b) => (a.date < b.date ? 1 : -1))[0];

// ---- Sheet 1: the example day ----
const clean = (d) => !fails(d).length && d.products >= 2 && d.lossMinutes > 0;
const example = args.day
  ? days.find((d) => `${d.line}@${d.date}` === args.day)
  : latest(days.filter((d) => d.line === EXAMPLE_LINE && clean(d)));
if (!example) {
  throw new Error('the example day was not found');
}
const lossOf = new Map(lossMap.map((e) => [`${e.line}|${e.column}`, e]));

function exampleSheet(s) {
  const book = readXlsx(join(root, s.file));
  const head = book.Base[0].map(norm).map((x) => x.replace('Week-end', 'Weekend'));
  const row = book.Base[s.baseRow];
  const val = (c) => row[head.indexOf(c)];
  const month = s.date.slice(0, 7);
  const mine = (table) => stage(table, month).filter((r) => r.MachineName === s.line && isoOf(r.Date) === s.date);
  const util = mine('Time_Utilisation_EU')[0];
  const plan = mine('Plan_OPT_EU');

  // 1. The day: 3 values.
  const oeeOurs = ratio(util['OEE Time Total'], util['Total Time Total']);
  const dayRows = [
    ['TOR  (real opening time)', s.TOR, '→', 'Total Time', util['Total Time Total']],
    ['TU  (useful time)', s.TU, '→', 'OEE Time', util['OEE Time Total']],
    ['OEE  (in your workbook)', pct(s.oeeBase), '→', 'OEE  (= TU / TOR)', pct(oeeOurs)],
  ];

  // 2. Products: one row each, in the order of the conversion.
  const slots = [];
  for (const shift of SHIFT_TYPES) {
    for (let k = 1; k <= 4; k += 1) {
      const f = (p) => val(`${p} PF${k} ${shift}`);
      if (norm(f('Code')) || num(f('Temps')) || num(f('Volume'))) {
        slots.push({ shift, name: norm(f('Nom')) || norm(f('Code')), time: num(f('Temps')), volume: num(f('Volume')), waste: num(f('Déchets')), speed: num(f('Vitesse')) });
      }
    }
  }
  const productRows = slots.map((x, i) => {
    const p = plan[i] ?? {};
    return [x.shift, x.name, x.volume, x.waste, x.speed, x.time, '→', p.ShiftName, p['Good Parts'], p.Capacity];
  });
  productRows.push([
    'Total',
    '',
    total(slots, (x) => x.volume),
    total(slots, (x) => x.waste),
    '',
    total(slots, (x) => x.time),
    '→',
    '',
    total(plan, (r) => r['Good Parts']),
    total(plan, (r) => r.Capacity),
  ]);

  // 3. Stops: one row each.
  const lossRows = [];
  head.forEach((c, i) => {
    const e = lossOf.get(`${s.line}|${c}`);
    const minutes = num(row[i]);
    if (e && minutes > 0) {
      lossRows.push([c, minutes, '→', e.OEELossLvl3Group, e.OEELossLvl3SubGroup, e.OEELossLvl3Desc, sure(e) ? 'MASTERDATA' : 'to check']);
    }
  });
  const lossTotal = total(lossRows, (r) => r[1]);
  const lossNote = lossTotal === s.TOR - s.TU ? '= TOR - TU, as in your workbook' : `TOR - TU = ${s.TOR - s.TU}`;
  lossRows.push(['Total', lossTotal, '→', '', '', lossNote, '']);

  return {
    name: 'Example day',
    widths: [36, 30, 12, 12, 12, 12, 5, 28, 26, 26, 14],
    blocks: [
      {
        title: `Example: ${s.line}, ${s.date}`,
        notes: [
          `Open the workbook ${s.file.split('/').at(-1)}, sheet Base (hidden: right-click a tab, Unhide), row ${s.baseRow + 1}.`,
          'On the left is what your workbook says, on the right what we put in SIH. Please check that the left side is your data and that the right side is what you expect.',
        ],
      },
      {
        title: '1. The day: 1 row in SIH',
        notes: ['The small OEE difference is rounding: your OEE is calculated from the volumes, ours from the minutes.'],
        header: ['In your workbook', 'Value', '', 'In SIH', 'Value'],
        rows: dayRows,
      },
      {
        title: `2. The products: ${slots.length} rows in SIH, one per product and shift`,
        notes: ['SIH Good Parts = Volume - Déchets. SIH Capacity = Vitesse x Temps.'],
        header: ['Shift', 'Product', 'Volume', 'Déchets', 'Vitesse', 'Temps', '', 'SIH shift', 'SIH Good Parts', 'SIH Capacity'],
        rows: productRows,
        boldLast: true,
      },
      {
        title: `3. The stops: ${lossRows.length - 1} rows in SIH, one per column with minutes`,
        header: ['Column in your workbook', 'Minutes', '', 'SIH type', '', 'SIH name', 'Name from'],
        rows: lossRows,
        boldLast: true,
      },
    ],
  };
}

// ---- Loss names: one row per machine part (Dysf, Panne, Réglage together) or per reason ----
// Three sheets, so the site can filter and answer one kind at a time:
// 1 the MASTERDATA name exists, 2 no MASTERDATA name (English of the workbook Category
// sheet), 3 no MASTERDATA name and no Category row (our translation).
const groups = new Map();
for (const e of lossMap) {
  const machine = e.machineLoss;
  const name = machine ? e.column.replace(MACHINE_LOSS, '') : e.column;
  const how = sure(e) ? 'same name' : e.mdName ? 'our proposal: please check' : e.from;
  const k = machine ? `${e.line}|${name}|${how}` : `*|${name}|${e.OEELossLvl3Desc}|${how}`;
  const g = groups.get(k) ?? {
    lines: new Set(),
    name,
    kind: machine ? 'Machine part (3 columns)' : 'Reason (1 column)',
    english: e.OEELossLvl3Desc,
    md: e.mdName,
    how,
    type: e.OEELossLvl3SubGroup,
    minutes: 0,
  };
  g.lines.add(e.line);
  g.minutes += e.minutes;
  groups.set(k, g);
}
const all = [...groups.values()].sort((a, b) => b.minutes - a.minutes);
const withMd = all.filter((g) => g.md);
const fromCategory = all.filter((g) => !g.md && g.how === 'Category');
const ours = all.filter((g) => !g.md && g.how !== 'Category');
const lineCount = new Set(days.map((d) => d.line)).size;
const lineText = (g) => (g.lines.size >= lineCount - 3 ? `all lines (${g.lines.size})` : [...g.lines].join(', '));

// The MASTERDATA names to choose from: a hidden sheet of the Excel feeds the drop-downs.
const mdBook = readXlsx(join(root, 'MASTERDATA.xlsx')).Downtime_updated.slice(2).map((x) => x.map(norm));
const mdNames = new Set();
for (const r of mdBook) {
  for (const c of [0, 5]) {
    mdNames.add(r[c + 2] || r[c]);
  }
  mdNames.add(r[12]);
}
mdNames.delete('');
mdNames.delete(undefined);

// ---- Questions, in plain words, with one real case each ----
const negative = latest(days.filter((d) => d.NR < 0));
const broken = latest(days.filter((d) => fails(d).length && d.NR >= 0));
const brokenCount = new Set(checks.map((c) => `${c[0]}|${c[1]}`)).size;
const QUESTIONS = [
  'LOSS NAMES (sheets 1, 2 and 3). SIH stores each stop under an English name from a list called MASTERDATA: the reasons the operators will pick in the new SIH entry page. Your workbooks use their own French names, so for every name of your workbook we show the English name we will store. Sheet 1: the name exists in MASTERDATA, please check it is the same thing ("same name" should be right, "our proposal" needs a real check). Sheet 2: not in MASTERDATA, the English comes from your own Category sheet, is it OK? Sheet 3 (CUPIDON, DAISY): the English is our translation, is it OK? Answer Yes or No in the yellow cells and, if No, write or choose the right name. Start at the top: the lists are sorted by the minutes lost.',
  'LOSS NAMES, column Kind. "Machine part (3 columns)" = your workbook has 3 columns for the same machine part, for example "Dysf REMPLISSEUSE (Scellage Tubes)", "Panne REMPLISSEUSE (Scellage Tubes)" and "Réglages REMPLISSEUSE (Scellage Tubes)" (minor stop, breakdown, adjustment). We show them as ONE row because the question is the same for the three: is REMPLISSEUSE (Scellage Tubes) = Filler? "Reason (1 column)" = one column for the whole line, for example "Nettoyage".',
  'For each product we calculate Good Parts = Volume - Déchets. Is this the right way to count good products?',
  'Night shifts end after midnight (Semaine Nuit 21:00-05:00, Weekend Nuit 17:00-05:00). On which date do you type the whole night shift: the day it started or the day it ended?',
  `NR is negative on ${days.filter((d) => d.NR < 0).length} days (example: ${negative.line}, ${negative.date}, NR = ${negative.NR}). A time cannot be negative, so we do not load it. Why is it negative (a correction by the operator)?`,
  `${dupes.length} days were entered twice in a workbook (example: ${dupes[0]}). We keep the entry saved last. Is this right?`,
  `${brokenCount} days break a rule of the entry form (example: ${broken.line}, ${broken.date}: ${fails(broken)[0]}). Do you know about these errors? We load these days as they are.`,
  'The OEE target file has 2026 only. For 2025 we used the 2026 target of the same month. Is there a 2025 target file, or can the 2025 dashboards use the 2026 targets?',
  'Sheet Data: we read FORMAT "200ml - Cap" as size 200ml + extra info Cap, and CASE "X6" as 6 units per case. Is this right?',
  'What was the minutes column "Temps non compté Libre 1" used for on ZEUS?',
  ...extraQuestions(),
];

// Added 2026-11-06: machine part, days entered twice that differ, Déchets above 0.
function extraQuestions() {
  const dup = readFileSync(join(OUT, 'duplicates.csv'), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => [...l.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]));
  const differ = dup.filter((d) => d[4] !== 'same' && d[4] !== 'Date et heure de la saisie');
  const lineOf = (file) => file.split('/').at(-1).replace(/^OEE | - \d{4}\.xlsm$/g, '');
  // A day entered three times gives two pairs: list each day once.
  const dupDays = [...new Set(differ.map((d) => `${lineOf(d[0])} ${d[1]}`))];
  const dupList = dupDays.join(', ');
  const waste = [];
  for (const month of new Set(days.map((d) => d.date.slice(0, 7)))) {
    for (const r of stage('Plan_OPT_EU', month)) {
      if (r['Defect Parts'] > 0) {
        waste.push(r);
      }
    }
  }
  waste.sort((a, b) => b['Defect Parts'] - a['Defect Parts']);
  const w = waste[0];
  let q1 = 'MACHINE PART (sheet 4). Your workbook columns often name the machine AND a part, ';
  q1 += 'for example "Dysf ETUYEUSE - Introduction Tubes". We now keep both: machine ';
  q1 += '"Skiletting Machine", name "Skiletting Machine - Tube Insertion" (the MASTERDATA ';
  q1 += 'part). Sheet 4 lists every column where we found a part. "exact part" should be ';
  q1 += 'right; "part name contained" is our proposal, please check. Some columns name two ';
  q1 += 'parts ("Chauffe / Scellage", "Introduction Tubes / Spatules", "Débordement Crème / ';
  q1 += 'Niveau cuve"): for now we keep only the machine. Which part should they get?';
  let q2 = `${dupDays.length} days were entered twice and the two copies are not the same: `;
  q2 += `${dupList}. Example CUMULUS 2025-01-24: two rows with the same date and no `;
  q2 += 'saving time; one has TOR 1340, TU 580, volume 18,012, the other TOR 1380, TU 414, ';
  q2 += 'volume 14,083 (72 of 383 columns differ). There is no row for 2025-01-25. ';
  q2 += 'Which copy is right for each day? Could one belong to another day?';
  let q3 = `You told us Déchets is always 0. We see Déchets above 0 in ${waste.length} `;
  q3 += `product rows (biggest: ${w.MachineName} ${isoOf(w.Date)}, Déchets `;
  q3 += `${Math.round(w['Defect Parts'])} for a Volume of ${Math.round(w['Good Parts'])}). `;
  q3 += 'What do these values mean? Should we keep them, or read them as 0?';
  return [q1, q2, q3];
}

// ---- Sheet 4: machine part, one row per line and column with a part or a part question ----
const partRows = lossMap
  .filter((e) => e.partEn || e.partCandidates)
  .sort((a, b) => b.minutes - a.minutes)
  .map((e) => [
    e.line,
    e.column,
    e.Equipment,
    e.partEn ?? `(none yet) ${e.partCandidates}`,
    e.partFr ?? '',
    e.partMethod,
    Math.round(e.minutes),
    '',
    '',
  ]);

const nameHead = ['Line', 'Name in your workbook', 'Kind'];
const answerCols = { validation: { col: 6, list: 'Yes,No' }, pick: [7], answer: [6, 7], filter: true };
const sheetLayout = { widths: [26, 44, 20, 34, 26, 14, 10, 34], freeze: { row: 5, col: 3 } };
const review = {
  example: exampleSheet(example),
  facts: { negativeDays: days.filter((d) => d.NR < 0).length, duplicateDays: dupes.length, brokenDays: brokenCount },
  pickList: [...mdNames].sort(),
  sheets: [
    {
      name: '1 MASTERDATA name',
      ...sheetLayout,
      freeze: { row: 6, col: 3 },
      blocks: [
        {
          title: 'The name exists in MASTERDATA (the reason tree of the SIH entry page). Is it right?',
          notes: [
            '"same name": same thing in your workbook and in MASTERDATA, should be right. "our proposal": we think it is the same, please check. Filter on this column. (The full explanation is in the sheet Questions, question 1 and 2.)',
            'Kind: Machine part (3 columns) = e.g. "Dysf / Panne / Réglages REMPLISSEUSE (Scellage Tubes)", shown as one row. Reason (1 column) = e.g. "Nettoyage".',
            'Minutes 2025-26 = all minutes lost on this name in 2025 and 2026. The list is sorted from the biggest loss, so start at the top.',
          ],
        },
        {
          header: [...nameHead, 'Name in SIH (MASTERDATA)', 'How matched', 'Minutes 2025-26', 'Right?', 'If No: the right name'],
          rows: withMd.map((g) => [lineText(g), g.name, g.kind, g.md, g.how, g.minutes, '', '']),
          ...answerCols,
        },
      ],
    },
    {
      name: '2 No MASTERDATA (Category)',
      ...sheetLayout,
      blocks: [
        {
          title: 'Not in MASTERDATA. The English is the translation of your own Category sheet. Is it right, or which MASTERDATA name fits?',
          notes: ['If the English is fine and MASTERDATA has nothing for it, answer Yes. Minutes 2025-26 = all minutes lost on this name; sorted from the biggest loss.'],
        },
        {
          header: [...nameHead, 'English used (your Category sheet)', 'SIH type', 'Minutes 2025-26', 'English OK?', 'If No: the MASTERDATA name'],
          rows: fromCategory.map((g) => [lineText(g), g.name, g.kind, g.english, g.type, g.minutes, '', '']),
          ...answerCols,
        },
      ],
    },
    {
      name: '3 No MASTERDATA (ours)',
      ...sheetLayout,
      blocks: [
        {
          title: 'Not in MASTERDATA and not in a Category sheet (CUPIDON and DAISY, lines dropped in 2026). The English is OUR translation. Is it right?',
          notes: ['Minutes 2025-26 = all minutes lost on this name; sorted from the biggest loss.'],
        },
        {
          header: [...nameHead, 'English used (our translation)', 'SIH type', 'Minutes 2025-26', 'English OK?', 'If No: the right name'],
          rows: ours.map((g) => [lineText(g), g.name, g.kind, g.english, g.type, g.minutes, '', '']),
          ...answerCols,
        },
      ],
    },
    {
      name: '4 Machine part',
      widths: [12, 44, 24, 30, 30, 30, 12, 10, 34],
      freeze: { row: 5, col: 3 },
      blocks: [
        {
          title: 'The machine part (MASTERDATA Level 4) we found in the name of your column. Is it right?',
          notes: [
            'SIH name = machine - part, e.g. "Skiletting Machine - Tube Insertion". See Questions, the machine part question.',
            'Sorted from the biggest loss (minutes 2025-26). "(none yet)": we keep the machine only and ask you which part.',
          ],
        },
        {
          header: ['Line', 'Column in your workbook', 'Machine (EN)', 'Part (EN)', 'Part (FR)', 'How matched', 'Minutes 2025-26', 'Right?', 'If No: the right part'],
          rows: partRows,
          validation: { col: 7, list: 'Yes,No' },
          answer: [7, 8],
          filter: true,
        },
      ],
    },
    {
      name: 'Questions',
      widths: [5, 130, 60],
      blocks: [
        {
          header: ['#', 'Question', 'Your answer'],
          rows: QUESTIONS.map((q, i) => [i + 1, q, '']),
          answer: [2],
        },
      ],
    },
  ],
};
writeFileSync(join(OUT, 'review.json'), JSON.stringify(review));
console.log(`review.json: ${review.sheets.length} sheets + example; MASTERDATA ${withMd.length}, Category ${fromCategory.length}, ours ${ours.length}`);
