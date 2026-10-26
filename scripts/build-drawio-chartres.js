// Builds diagrams/chartres-source-map.drawio: the Chartres OEE source files for review.
// Pages: 1 folders, 2 do the macros cover 2026, 3 Base columns (French, English,
// abbreviations), 4 what differs per line, 5 to 7 Base to Plan_OPT_EU,
// Time_Utilisation_EU, Daily_Losses_EU, 8 questions.
// Reads diagrams/data/chartres-profile.json (node scripts/helper-chartres-diagram-data.js).
// Usage: node scripts/build-drawio-chartres.js, check with node scripts/validate-drawio.js diagrams/chartres-source-map.drawio
import { readFileSync, writeFileSync } from 'node:fs';

const OUTPUT = 'diagrams/chartres-source-map.drawio';
const data = JSON.parse(readFileSync('diagrams/data/chartres-profile.json', 'utf8'));

// ---- Colours ----------------------------------------------------------------
const LEVEL = {
  have: { fill: '#d5e8d4', stroke: '#82b366', label: 'FROM BASE, CHECKED ON THE FILES' },
  fixed: { fill: '#dae8fc', stroke: '#6c8ebf', label: 'FIXED VALUE OR LOOKUP (CONFIG)' },
  test: { fill: '#ffe6cc', stroke: '#d79b00', label: 'RULE TO CONFIRM' },
  none: { fill: '#f8cecc', stroke: '#b85450', label: 'NO SOURCE IN THE CHARTRES FILES' },
  warn: { fill: '#fff2cc', stroke: '#d6b656', label: 'WATCH / DIFFERENCE' },
  grey: { fill: '#f5f5f5', stroke: '#999999', label: 'NOT USED (COPIES, BACKUPS)' },
  table: { fill: '#ffffff', stroke: '#666666', label: '' },
  head: { fill: '#dddddd', stroke: '#666666', label: '' },
};

// ---- Drawing helpers (same style as build-drawio-segun-tables.js) -----------
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bold = (s) => `<b>${esc(s)}</b>`;
const small = (s) => `<font style="font-size:9px" color="#555555">${esc(s)}</font>`;
// Text such as "<part>" must not be read as a tag: only b, br and font stay tags.
const safe = (html) => html.replace(/<(?!\/?(b|br|font)[ >\/])/g, '&lt;');
const plain = (html) =>
  html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Height that fits the text; html may contain <br>.
function fit(width, raw) {
  const html = safe(raw);
  const usable = width - 16;
  let lines = 0;
  for (const part of html.split('<br>')) {
    lines += Math.max(1, Math.ceil((plain(part).length * 6.1) / usable));
  }
  return Math.ceil((lines * 15 + 16) / 10) * 10;
}

class Page {
  constructor(name, index) {
    this.name = name;
    this.index = index;
    this.cells = [];
    this.n = 1;
  }

  id() {
    this.n += 1;
    return `ch${this.index}c${this.n}`;
  }

  box(x, y, w, h, html, level = 'table', extra = '') {
    const { fill, stroke } = LEVEL[level];
    const id = this.id();
    html = safe(html);
    let style = 'rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;';
    style += 'spacingLeft=8;spacingRight=6;fontSize=11;';
    style += `fillColor=${fill};strokeColor=${stroke};${extra}`;
    this.cells.push(
      `<mxCell id="${id}" value="${esc(html)}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );
    return id;
  }

  text(x, y, w, h, html) {
    const id = this.id();
    html = safe(html);
    const style = 'text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontSize=12;';
    this.cells.push(
      `<mxCell id="${id}" value="${esc(html)}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );
    return id;
  }

  edge(source, target, color = '#666666') {
    const id = this.id();
    let style = 'edgeStyle=entityRelationEdgeStyle;html=1;endArrow=block;endFill=1;';
    style += `strokeWidth=1.5;strokeColor=${color};`;
    this.cells.push(
      `<mxCell id="${id}" style="${style}" edge="1" parent="1" source="${source}" target="${target}">` +
        '<mxGeometry relative="1" as="geometry"/></mxCell>',
    );
  }

  xml() {
    let head = `<diagram name="${esc(this.name)}" id="chartres${this.index}">`;
    head += '<mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" ';
    head += 'connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">';
    head += '<root><mxCell id="0"/><mxCell id="1" parent="0"/>';
    return `${head}${this.cells.join('')}</root></mxGraphModel></diagram>`;
  }
}

// A row of cells: widths[i] and html[i]; level is one string or one per cell.
// Returns the y below the row.
function row(page, x, y, widths, cells, level = 'table') {
  const height = Math.max(...cells.map((c, i) => fit(widths[i], c)));
  let left = x;
  cells.forEach((c, i) => {
    page.box(left, y, widths[i], height, c, Array.isArray(level) ? level[i] : level);
    left += widths[i];
  });
  return y + height;
}

function legend(page, x, y, keys) {
  let left = x;
  for (const key of keys) {
    page.box(left, y, 230, 30, bold(LEVEL[key].label), key, 'fontSize=9;');
    left += 240;
  }
}

const title = (page, heading, sub) => {
  page.text(40, 20, 1500, 60, `${bold(heading)}<br>${small(sub)}`);
};

// ---- Page 1: folders ----------------------------------------------------------
const p1 = new Page('1 Folders', 1);
title(p1, 'Chartres: what is in the downloaded folders (downloads/Chartres)',
  'Four groups, each with 2024, 2025 and 2026. The file we need is <group>/<year>/SAISIE OEE/OEE <line> - <year>.xlsm '
  + '(one workbook per production line and year). Counts are files in the folder, subfolders included. Role of a folder = read from its name and content (French names translated), to confirm with the site.');
legend(p1, 40, 90, ['have', 'fixed', 'warn', 'grey', 'none']);
p1.text(40, 130, 1500, 20, small('green = OEE entry workbook (our source) | blue = daily/monthly exports written by the macros (PlanOPT, LineLosses) | yellow = other workbooks, not profiled | grey = copies and backups | red = blocker'));

const TREES = [
  {
    group: 'CREAM Chartres',
    sub: '6 lines: CUMULUS, CUPIDON, DAISY, IWKA 1, IWKA 2, IWKA 3',
    rows: [
      [0, 'warn', '2024/ (26 files): "DOR Personal Care.xlsm" and a dated copy = the older group workbook; "OEE DAISY - TEST.xlsm" = a test; test lien.xlsx'],
      [1, 'grey', 'Backup/ (22): dated copies of the DOR file (Nov to Dec 2024), v00, TEST BLUE PRINT'],
      [0, 'warn', '2025/ (18): "DOR Personal Care - Version 2025.xlsm" (group workbook), CREAM_Export_20250913.pdf'],
      [1, 'grey', 'Backup/ (4): copies of the 2025 DOR file'],
      [1, 'have', 'SAISIE OEE/ (12) = "data entry OEE": 6 x OEE <line> - 2025.xlsm'],
      [2, 'warn', 'TRSCOS2.xls (old .xls format, not profiled)'],
      [2, 'grey', 'Archives/ (2 older IWKA copies), Fichiers de travail/ = working files (1 test copy), SAISIE 2025/ (2 dated DOR copies)'],
      [0, 'warn', '2026/: "DOR Personal Care - Version 2026.xlsm"; 90 Days Action Plan/ (1 xlsx, action plan); OEE WEEKLY REVIEW/ (empty)'],
      [1, 'have', 'SAISIE OEE/ (332): 6 x OEE <line> - 2026.xlsm'],
      [2, 'fixed', 'PlanOpt/ (161) and LineLosses/ (165): one export file per line and day, 2026-08-01 to 2026-10-23, 4 lines (CUMULUS, IWKA 1, 2, 3)'],
    ],
  },
  {
    group: 'DOR L3',
    sub: 'lines not named; no SAISIE OEE folder',
    rows: [
      [0, 'none', 'BLOCKER: no SAISIE OEE folder and no OEE*.xlsm in any year. Laura (site owner) must confirm which file is the OEE source'],
      [0, 'warn', '2024/ (37): L3 DOR.xlsm (25 MB); Backup/ (L3 DOR2.xlsm, DOR L3/ 2 files, Présence Absence/ = attendance, empty); Fichiers de travail - Ne pas utiliser/ = working files, do not use (empty)'],
      [1, 'warn', 'DI/ and OT/ (2 each): Export.xlsx + archived exports. Probably maintenance requests and work orders (inferred from the French abbreviations)'],
      [1, 'warn', 'Suivi IWKA 2/ = IWKA 2 follow-up (29): Daily 19, Weekly 4, BiWeekly 1, Monthly 2, Fichier de données 3'],
      [0, 'warn', '2025/ (115): L3 DOR Version 2025.xlsm (29 MB), BREAKFAST CHARTRES 2025.xlsm (46 MB), Six to Fix Zulia IWK1.xlsx, Suivi creme Zulia-Jordan sur IWKA.xlsx'],
      [1, 'grey', 'FICHIER DE TRAVAIL - NE PAS UTILISER/ (95): a copy of the Breakfast file + RAPPORTS/ (94 reports)'],
      [1, 'warn', 'L3 Board/ (L3 board - Daily Management - Chartres.xlsm, LIMS EXPORT/); OEE GLIDEPATH REVIEW/ (5 .pptm weekly reviews, weeks 38 to 42); DI/, OT/; RPS HOURLY TARGET/ (4 xlsx); RPS Reporting/ (1 xlsx)'],
      [0, 'warn', '2026/ (21): BREAKFAST CHARTRES 2026.xlsm (Breakfast Report/ with RAPPORTS/ 11 and Backup/), L3 board 2026, Working Files/DATA CHARTRES 2026.xlsm (24 MB), RPS - MOS Hourly Target 2026/, 5 xlsx (Automatic Report source with AI, OEE démontré, OEE Simulator, Suivi Présence, Volume repartition)'],
    ],
  },
  {
    group: 'NON TISSE',
    sub: '7 lines: HOME 1 to 4, SACHA 1 and 2, SUGAR',
    rows: [
      [0, 'warn', '2024/ (133): 13 "DOR Non Woven <date>.xlsm" files; saisie OEE 2025/ (1 DOR file of 20 Jan 2025)'],
      [1, 'grey', 'Backup/ (119): dated copies of the DOR file, Jun to Dec 2024'],
      [0, 'warn', '2025/ (19): "DOR Non Woven 2025.xlsm"; BACKUP/ (1 copy)'],
      [1, 'have', 'SAISIE OEE/ (17): 7 x OEE <line> - 2025.xlsm'],
      [2, 'grey', 'Fichier de travail/ (1 TEST), SAISIE 2025/ (9 dated DOR copies, 24 Jan to 5 Feb 2025)'],
      [0, 'warn', '2026/: "DOR Non Woven 2026.xlsm"; 90 Days Action Plan/ and OEE WEEKLY REVIEW/ (both empty)'],
      [1, 'have', 'SAISIE OEE/ (127): 7 x OEE <line> - 2026.xlsm'],
      [2, 'fixed', 'PlanOPT/ (47) and LineLosses/ (47): daily exports 2026-08-03 to 2026-10-23, only HOME 1, 3, 4 (no HOME 2, SACHA, SUGAR)'],
      [2, 'fixed', 'PlanOPT_january/ (13) and LineLosses_january/ (13): ONE file per line for January 2026 (5 to 30 Jan), for 13 lines of ALL three groups (misfiled here)'],
    ],
  },
  {
    group: 'SKIN CARE',
    sub: '5 lines: APOLLON, CLÉOPATRE, NEPTUNE, OLYMPE, ZEUS',
    rows: [
      [0, 'grey', '2024/ (103): only Backup/ with dated copies of "DOR Skin Care" (Jun to Dec 2024)'],
      [0, 'warn', '2025/ (8): "DOR Skin Care Version 2025.xlsm"; BACKUP/ (1 copy)'],
      [1, 'have', 'SAISIE OEE/ (6): 5 x OEE <line> - 2025.xlsm (moved here by you: they were under 2026/2025/)'],
      [2, 'grey', 'Fichiers de Travail/ (1 TEST copy), SAISIE 2025/ (empty)'],
      [0, 'warn', '2026/: "DOR Skin Care Version 2026.xlsm"; 90 Days Action Plan/ and OEE WEEKLY REVIEW/ (empty)'],
      [1, 'have', 'SAISIE OEE/ (319): 5 x OEE <line> - 2026.xlsm'],
      [2, 'fixed', 'PlanOPT/ (157) and LineLosses/ (157): daily exports 2026-08-03 to 2026-10-06, all 5 lines'],
      [2, 'grey', 'LineLosses_january/ and PlanOPT2026/ exist but are empty'],
    ],
  },
];

const COL_W = 560;
let treeBottom = 0;
TREES.forEach((t, i) => {
  const x = 40 + i * (COL_W + 20);
  let y = 170;
  p1.box(x, y, COL_W, 30, bold(t.group), 'head');
  y += 30;
  p1.box(x, y, COL_W, 24, small(t.sub), 'table');
  y += 34;
  for (const [indent, level, text] of t.rows) {
    const w = COL_W - indent * 24;
    const h = fit(w, text);
    p1.box(x + indent * 24, y, w, h, text, level);
    y += h + 4;
  }
  treeBottom = Math.max(treeBottom, y);
});

// What differs: one table, one row per aspect.
let y1 = treeBottom + 30;
p1.text(40, y1, 1500, 24, bold('What differs between the groups'));
y1 += 30;
const W1 = [210, 300, 300, 300, 300];
y1 = row(p1, 40, y1, W1, [bold('Aspect'), bold('CREAM Chartres'), bold('NON TISSE'), bold('SKIN CARE'), bold('DOR L3')], 'head');
const DIFFS = [
  ['OEE entry workbooks', '6 lines x 2025, 2026', '7 lines x 2025, 2026', '5 lines x 2025, 2026', 'none found'],
  ['Where 2025 files sit', 'SAISIE OEE/ 2025', 'SAISIE OEE/ 2025', 'SAISIE OEE/ 2025 (you moved them)', 'n/a'],
  ['Macro export folders (2026)', 'PlanOpt, LineLosses (daily, 4 lines)', 'PlanOPT, LineLosses (daily, 3 lines) + january folders (13 lines, all groups)', 'PlanOPT, LineLosses (daily, 5 lines); 2 empty folders', 'none'],
  ['Group workbook at year level', 'DOR Personal Care', 'DOR Non Woven', 'DOR Skin Care', 'L3 DOR / BREAKFAST CHARTRES / DATA CHARTRES'],
  ['Backups of 2024', '22 copies', '119 copies', '103 copies', 'few'],
  ['Other material', 'PDF export, 90 days plan', 'empty plan folders', 'empty plan folders', 'DI, OT, L3 Board, RPS targets, glidepath reviews, Suivi IWKA 2'],
];
for (const r of DIFFS) {
  y1 = row(p1, 40, y1, W1, [bold(r[0]), r[1], r[2], r[3], r[4]], ['head', 'table', 'table', 'table', r[0] === 'OEE entry workbooks' ? 'none' : 'table']);
}
y1 += 20;
const NOTE1 = 'Not profiled (outside the pattern): the year-level "DOR <group> ... .xlsm" files. They may be the group roll-up of the lines. '
  + 'The 2024 entry was most likely in those DOR files (dated backups), so 2024 has no OEE <line>.xlsm at all.';
p1.box(40, y1, 1500, fit(1500, NOTE1), NOTE1, 'warn');

// ---- Page 2: do the macros cover 2026? ---------------------------------------
const p2 = new Page('2 Macros and 2026', 2);
title(p2, 'Does the PlanOPT / LineLosses conversion cover all of 2026? No.',
  '18 OEE workbooks for 2026. The macros (Module_PlanOPT, Module_LineLosses) exist in 13. Their sheets keep only the LAST exported day. '
  + 'History is in the daily export files (Aug to Oct) and one January export. You prefer Base directly: this page shows what the macros would and would not give.');
legend(p2, 40, 90, ['have', 'warn', 'none']);

const files2026 = data.files.filter((f) => f.year === '2026');
const dailyLines = new Set();
const janLines = new Set();
for (const e of data.exports.filter((x) => /^planopt/i.test(x.folder))) {
  const target = /january/i.test(e.folder) ? janLines : dailyLines;
  e.lines.forEach((l) => target.add(l.replace(/_.*$/, '')));
}
const W2 = [120, 100, 200, 260, 330, 330];
let y2 = 140;
y2 = row(p2, 40, y2, W2, [bold('Group'), bold('Line'), bold('Macros + PlanOPT / LineLosses sheets'), bold('Day held in the sheets now'), bold('Daily export files (Aug to Oct 2026)'), bold('January 2026 export')], 'head');
for (const f of files2026) {
  const key = `OEE ${f.line} - 2026`;
  const hasMacro = f.planSheet;
  const filled = f.planRows > 0;
  const daily = dailyLines.has(key);
  const jan = janLines.has(key);
  y2 = row(p2, 40, y2, W2, [
    f.group.replace(' Chartres', ''),
    bold(f.line),
    hasMacro ? 'yes (13 of 18 have them)' : 'NO macros, no sheets: Base only',
    !hasMacro ? '-' : filled ? `${f.planDay}, ${f.planRows} product rows, ${f.lossRows} loss rows` : 'sheets are EMPTY (never run, or cleared)',
    daily ? 'yes' : 'no export file',
    jan ? 'yes' : 'no',
  ], [
    'table',
    'table',
    hasMacro ? 'have' : 'none',
    !hasMacro ? 'none' : filled ? (f.planDay >= '2026-10-01' ? 'have' : 'warn') : 'warn',
    daily ? 'have' : 'none',
    jan ? 'have' : 'none',
  ]);
}
y2 += 30;
p2.text(40, y2, 1500, 24, bold('Coverage in time (whatever the macros wrote)'));
y2 += 30;
const bar = [
  [40, 'none', '2025: no macro output at all. Build from Base (about 5 Jan to 23 Dec 2025 for most lines)', 360],
  [400, 'have', 'Jan 2026: ONE monthly file per line (5 to 30 Jan), 13 lines', 300],
  [700, 'none', 'Feb to Jul 2026: no macro output. Build from Base', 360],
  [1060, 'have', 'Aug 1/3 to Oct 23, 2026 (SKIN CARE to Oct 6): daily files for 12 of the 18 lines', 480],
];
for (const [x, level, text, w] of bar) {
  p2.box(x, y2, w, 60, text, level);
}
y2 += 90;
p2.text(40, y2, 1500, 24, bold('The macro output is not the same as the workbook\'s own rules (checked on the 10 files that hold a day)'));
y2 += 30;
const CHECKS = [
  ['have', 'Good Parts = Volume of the product slot, Target = Capacity = Vitesse x Temps, Total Time = Temps, Downtime Units = Target - Good Parts. Equal on every product row of the 10 files.'],
  ['warn', 'Good Parts uses the declared Volume and ignores Déchets (waste). The sheet "OEE" of the same workbook computes Volume Réel = Volume Annoncé - Déchets. Defect Parts is left empty.'],
  ['none', 'Planned OpT and OEE Time are always empty (except ZEUS, which has values in some rows). Plan_OPT_EU needs both, so they must be calculated anyway.'],
  ['warn', 'ShiftName is a number 1 to 5 (the 5 shift types), not a name. PartName is a lookup that gives a different kind of value per line (a name, a size such as "100ml", or one code repeated on all products of a day in IWKA 2).'],
  ['warn', 'LineLosses disagrees with the Category sheet of the same file: every Panne (breakdown) and Réglages (adjustment) line is written as "Minor stop", and every "... Autre" line of the Dysf / Panne / Réglages blocks as Planned losses / Cleaning / Other. 19 to 49 rows per file differ (all 10 files). Category says Breakdown, Adjustment and Unplanned.'],
  ['have', 'Loss durations in LineLosses add up to the eight loss totals of Base (Organisation to Maintenance) + the "Temps non compté" columns, in 6 of 10 files; the other 4 are off by 20 to 70 minutes (probably the not-counted time of TownHall, training, trials; not verified).'],
];
for (const [level, text] of CHECKS) {
  const h = fit(1500, text);
  p2.box(40, y2, 1500, h, text, level);
  y2 += h + 6;
}
y2 += 10;
const REC2 = bold('Recommendation: ') + 'build every day from Base with the Category sheet (one rule for 2025 and 2026 and for every line), '
  + 'and use the daily export files of Aug to Oct 2026 and the January file only as a test: our rows for the same line and day must equal the macro rows, '
  + 'except where the table above shows the macro differs from the workbook rules. Running the macros ourselves is not needed and we do not run macros.';
p2.box(40, y2, 1500, fit(1500, REC2), REC2, 'fixed');

// ---- Page 3: Base columns ------------------------------------------------------
const p3 = new Page('3 Base columns', 3);
title(p3, 'Sheet "Base": the important columns (French, English, abbreviations)',
  'One row = one day of one line, newest day on top. Letters are those of the CREAM template (IWKA 2); other lines shift after the machine blocks (page 4). '
  + 'English = the translation or the wording of the sheet "Category" of the same workbook. "(inferred)" = meaning worked out from formulas and numbers, to confirm with the site.');
legend(p3, 40, 90, ['have', 'test', 'warn']);
const W3 = [110, 430, 430, 330, 230];
let y3 = 140;
y3 = row(p3, 40, y3, W3, [bold('Columns'), bold('French (as in the file)'), bold('English'), bold('Abbreviation / note'), bold('Feeds')], 'head');
const BASE_ROWS = [
  ['A to D', 'ANNEE, MOIS, SEMAINE, JOUR', 'Year, Month, Week, Day', 'The day of the row (also column MV "Date", an Excel serial number, and MW "Vérification Semaine" = week check)', 'Date, all 3 tables', 'have'],
  ['E to H', 'TOP, TOR, TU, NR', 'minutes of the day: TOP, TOR, TU, NR', 'TOP = scheduled opening time (inferred). TOR = TOP minus the time not counted in LR to LW (checked: TOP = TOR + LR..LW). TU = "Temps Utile", useful time = OEE time (checked: about the sum of Volume / Vitesse over the day, 9 of 10 files). NR = "Non Renseigné", time not accounted for (becomes the loss "Undefined")', 'Time_Utilisation_EU, Plan_OPT_EU', 'test'],
  ['I to Q', 'Démarrage Ligne, Arrêt Ligne, Pauses, Nettoyage, Désinfection, Perte Cadence, Organisation Autre, Orga Libre 1, 2', 'Line start-up, Line shut-down, Breaks, Cleaning, Sanitization, Reduced speed, Other, spare 1, 2', 'Minutes. Group "Organisation". Planned losses, except Perte Cadence (unplanned). "Libre" = free, spare slot a line can name', 'Daily_Losses_EU', 'have'],
  ['R to AD', 'Changement de Format, Changement de Formule, Changement Composant / Lot / OF, Changement de consommable, Changement Libre 1 to 6; Nbre de changement ...', 'Format changeover, Formula change, Component / batch / work order change, Consumable refill, spare 1 to 6; Number of changes', 'Minutes, except the three "Nbre ..." columns (S, U, W) which are COUNTS and are not in Total Changement (R + T + V + X). OF = Ordre de Fabrication = work order. Planned losses', 'Daily_Losses_EU (not the counts)', 'have'],
  ['AE to AM', 'Rupture Formule, Composants, Personnel, Utilité, Technicien; Manque Documentation; Évacuation - Alarme Incendie; Rupture OF / Planning; Rupture Libre 2', 'Lack of formula, materials, crew, utilities, technician; lack of documents; fire alarm; lack of work order / planning', 'Minutes. Unplanned losses, group "Lack of resources"', 'Daily_Losses_EU', 'have'],
  ['AN to AT', 'Qualité Composants, Qualité Formule, Erreur / Retraitement / Recontrôle, Réglages Camera, Qualité Libre 1 to 3', 'Quality issue: materials, formula, rework, camera adjustments, spare', 'Minutes. Unplanned losses, group "Quality issue"', 'Daily_Losses_EU', 'have'],
  ['AU to BZ', 'Dysf <partie machine>  (Dysf = Dysfonctionnement)', 'Malfunction of <machine part> = minor stop', '32 slots, named per line (page 4). Unplanned, "Minor stop" in Category', 'Daily_Losses_EU', 'have'],
  ['CA to DF', 'Panne <partie machine>', 'Breakdown of <machine part>', '32 slots, same parts. Category: "Breakdown" (the macro export writes Minor stop)', 'Daily_Losses_EU', 'have'],
  ['DG to EL', 'Réglages <partie machine>', 'Adjustments of <machine part>', '33 slots (the first is "Réglages Camera" in some files). Category: "Adjustment" (macro export: Minor stop)', 'Daily_Losses_EU', 'have'],
  ['EM to ES', 'Auto Maintenance, Maintenance Préventive Mensuelle / Annuelle / Autre, Action Maintenance Planifiée, Libre 1, 2', 'Operator asset care, Monthly / Annual / Other maintenance, Planned actions, spare', 'Minutes. Planned losses, group "Planned maintenance"', 'Daily_Losses_EU', 'have'],
  ['ET to LQ (180)', '<Champ> PF<n> <équipe>: Code, Temps, Volume, Déchets, Nom, Nom Formule, Caisse, Format, Vitesse', '<Field> product slot <n> <shift>: Code, Time, Volume, Waste, Name, Formula name, Case, Format, Speed', 'PF = Produit Fini = finished product, 4 slots (PF1 to PF4) per shift. 5 shifts: Semaine Matin / Après Midi / Nuit = weekday morning / afternoon / night; Weekend Matin / Nuit = weekend morning / night. 9 fields x 4 x 5 = 180. Temps = minutes run, Vitesse = units per minute, Caisse = case pack', 'Plan_OPT_EU (one row per filled slot)', 'have'],
  ['LR to LW', 'TownHall - Réunion, Essais Planifiés, Formation, Validation / Qualification, Temps non compté Libre 1, 2', 'Town hall meeting, Planned trials, Training, Validation / Qualification, spare', 'Time not counted in TOR. Groups "Production not scheduled" and "NPD/CapEX & Trials"', 'Daily_Losses_EU (decide)', 'test'],
  ['LX to MI', 'People Journée, Matin, Après Midi, Nuit, Week End Matin, Week End Nuit, Libre 1 to 6', 'People (headcount): day, morning, afternoon, night, weekend morning, weekend night', 'Headcount per shift. No target table has it', 'not used', 'warn'],
  ['MJ to MS', 'Total Organisation, Changement, Rupture, Qualité, Dysfonctionnement, Panne, Réglage, Maintenance Planifiée, Temps Fermeture, Volume', 'Totals per block, closed time, total volume', 'Formulas (SUM of the block). Good for checks, not needed as input', 'check only', 'have'],
  ['MT to NG', 'Vérification TO, OEE, Date, Vérification Semaine, Vérification TOR, Total Déchets, Total Temps de production, Vérification TU, Date et heure de la saisie, Vérification Libre 5 to 9', 'Check TO, OEE, Date, Week check, TOR check, Total waste, Total production time, TU check, Entry date and time, spare checks', 'OEE is a stored value (macro), not a formula. Vérification TO = TU + NR + 8 loss totals and must equal TOR', 'check, and OEE for the test', 'have'],
  ['NH to NS', 'Sécurité Nombre d\'actions ouvertes, Nombre d\'actions cloturées, Nombre de "NON" total de la journée, Sécurité Libre 1 to 9', 'Safety: number of open actions, closed actions, number of "NO" answers of the day', 'Safety check of the shift. No target table has it', 'not used', 'warn'],
];
for (const r of BASE_ROWS) {
  y3 = row(p3, 40, y3, W3, [bold(r[0]), r[1], r[2], r[3], r[4]], ['head', 'table', 'table', r[5], 'table']);
}

// ---- Page 4: what differs per line ----------------------------------------------
const p4 = new Page('4 Differences per line', 4);
title(p4, 'Base columns: what differs between lines and years',
  'Same skeleton in all 36 files (blocks and formulas of page 3). Differences are in the names of the three machine blocks and in a few extra columns. '
  + 'The machine part list is the same in the Dysf, Panne and Réglages blocks of a line, so it is shown once.');
legend(p4, 40, 90, ['have', 'warn', 'none']);
const W4 = [250, 560, 700];
let y4 = 140;
y4 = row(p4, 40, y4, W4, [bold('Difference'), bold('Which files'), bold('What it means for the mapping')], 'head');
const D4 = [
  ['Machine part names', 'Every line has its own list: 9 to 24 named parts out of 32 slots, the rest are "Libre" (spare)', 'The loss description (Level 3) comes from the Category sheet, so a new part needs no code change. Without a Category sheet (all 2025 files, CUPIDON and DAISY 2026) a French to English dictionary is needed', 'warn'],
  ['Fewer columns: 353', 'IWKA 3, 2025 and 2026 (22 slots per block instead of 32)', 'Read the block by header name, never by column letter', 'warn'],
  ['More columns: 404', 'NON TISSE HOME 1 to 4 and SACHA 1 and 2, 2025 and 2026: "People ZAC" and "People Ext ZAC" (12), "Déchets <machine> <shift>" (15 in HOME: SIEREM - NORDSON, CAM, CERMEX; 5 in SACHA) and "Déchets Libre 1 to 6"', 'Total Déchets of these files sums the per-machine waste columns, not the product waste cells. Decide which waste to use before Good Parts', 'warn'],
  ['People ZAC (12)', 'All SKIN CARE files and NON TISSE HOME / SACHA. CREAM and SUGAR have only the 12 generic People columns', 'Not used in the three tables', 'have'],
  ['"Réglage" (singular)', 'APOLLON and CLÉOPATRE: the first 18 adjustment slots are "Réglage <part>"; the others "Réglages <part>"', 'Match the prefix with a pattern, not an exact word', 'warn'],
  ['Category sheet', 'Only in the 2026 files of 16 lines (all except CUPIDON and DAISY); not in any 2025 file', 'For the others the same French name usually exists in another file of the group: build one dictionary from all Category sheets and check the gaps', 'warn'],
  ['Empty or short files', 'CUPIDON 2026 and DAISY 2026 hold no day. CUPIDON 2025 ends 2025-09-22, DAISY 2025 ends 2025-11-06, CLÉOPATRE has the fewest days', 'Nothing to load for the two empty files', 'none'],
  ['Repeated date', 'CUMULUS 2025 (7 days) and ZEUS 2025 (2 days) have two rows for one date', 'Needs a rule: second entry replaces the first, or both are summed', 'warn'],
];
for (const r of D4) {
  y4 = row(p4, 40, y4, W4, [bold(r[0]), r[1], r[2]], ['head', 'table', r[3]]);
}
y4 += 20;
const GLOSS = bold('Words in the machine part names (French to English)') + '<br>'
  + 'REMPLISSEUSE = filler | ETUYEUSE = cartoner (puts tubes in cartons) | ENCAISSEUSE = case packer | SPATULEUSE = spatula dispenser | VISSEUSE = capper (screwing) | ÉTIQUETEUSE / Étiqueteuse = labeller | OPERCULEUSE = lid sealer | SLEEVEUSE = sleeving machine | SCOTCHEUSE = tape sealer | Palettiseur = palletiser | Empileur = stacker | Embarquetteuse = tray packer | Coiffeuse = cap placer | Déviateur = diverter | Formeuse Barquette = tray former | Vide fût = barrel emptier | Bac = tank | Bol = bowl feeder | Trieuse Pondérale = checkweigher | Tapis Rétractable = retractable conveyor | Convoyeur Sortie = outfeed conveyor | Vérin = cylinder<br>'
  + 'Magasin = magazine (hopper) | Orientation = orientation | Scellage = sealing | Introduction / Prise / Fermeture / Éjection = infeed / pick-up / closing / ejection | Bourrage = jam | Point de colle = glue spot | évacuation = discharge | Étuis = cartons | Caisses = cases | Étiquettes = labels | Lecteur code barres = barcode reader | Bouchons = caps | Flacons = bottles | Pots = pots | Notices = leaflets | Sachets = sachets | Autre(s) = other | Non identifié = unidentified | Libre = spare<br>'
  + 'Names such as DOMINO, METTLER, GARVENS, CERMEX, NORDSON, SIEREM, CAM, KOSME, FANUC, SERAC, BECK, SOCO, IMAJE look like equipment makers and are kept as they are.';
p4.box(40, y4, 1510, fit(1510, GLOSS), GLOSS, 'table');
y4 += fit(1510, GLOSS) + 30;

p4.text(40, y4, 1500, 24, bold('Machine parts per line (2026 files; 2025 uses the same list). French name as typed -> English machine category of the sheet Category (blank = no Category sheet in the file)'));
y4 += 34;
const COLS4 = 3;
const BOX4 = 500;
const lines2026 = data.files.filter((f) => f.year === '2026');
// English from any Category sheet for the same French part (fallback for lines without one).
const dictionary = {};
for (const f of data.files) {
  for (const p of f.dysfParts) {
    if (p.en) {
      dictionary[p.fr.toLowerCase()] = p.en;
    }
  }
}
let col4 = 0;
let rowTop = y4;
let rowMax = 0;
for (const f of lines2026) {
  const parts = f.dysfParts.map((p) => {
    const en = p.en || dictionary[p.fr.toLowerCase()];
    return `${esc(p.fr)} -> ${en ? esc(en) : '?'}${p.en ? '' : (en ? ' (from another line)' : '')}`;
  });
  const head = `${bold(`${f.group.replace(' Chartres', '')} / ${f.line}`)}: ${f.baseColumns} columns, ${parts.length} named parts, ${32 - parts.length} spare`;
  const html = `${head}<br>${parts.join('<br>')}`;
  const h = fit(BOX4, html);
  const x = 40 + col4 * (BOX4 + 10);
  p4.box(x, rowTop, BOX4, h, html, f.group.startsWith('CREAM') ? 'have' : f.group.startsWith('NON') ? 'fixed' : 'warn', 'verticalAlign=top;');
  rowMax = Math.max(rowMax, h);
  col4 += 1;
  if (col4 === COLS4) {
    col4 = 0;
    rowTop += rowMax + 10;
    rowMax = 0;
  }
}

// ---- Pages 5 to 7: Base to the three tables ----------------------------------------
const W5 = [190, 250, 480, 140, 450];
const flow = (page, y, steps) => {
  const w = 330;
  let prev = null;
  steps.forEach((s, i) => {
    const h = 90;
    const id = page.box(40 + i * (w + 60), y, w, h, s[1], s[0]);
    if (prev) {
      page.edge(prev, id);
    }
    prev = id;
  });
  return y + 110;
};
const STATUS = { have: 'checked', fixed: 'fixed / lookup', test: 'to confirm', none: 'no source' };
function mapping(page, y, rows) {
  y = row(page, 40, y, W5, [bold('Target column'), bold('Example (IWKA 2, 23 Oct 2026)'), bold('From Base (French) or rule'), bold('Status'), bold('Note')], 'head');
  for (const r of rows) {
    y = row(page, 40, y, W5, [bold(r[0]), r[1], r[2], STATUS[r[3]], r[4]], ['head', 'table', r[3], r[3], 'table']);
  }
  return y;
}

const p5 = new Page('5 Base to Plan_OPT_EU', 5);
title(p5, 'Base -> Plan_OPT_EU (one row per day, shift and product slot)',
  'Grain: for each day, each of the 5 shift types x 4 product slots that holds a Code, Volume or Temps becomes one row. '
  + 'The macro rule of the PlanOPT sheet is reproduced where it was checked on the files. Target columns and examples follow the EU extract (diagrams/data/eu-extract-profile.json).');
legend(p5, 40, 90, ['have', 'fixed', 'test', 'none']);
let y5 = flow(p5, 140, [
  ['table', `${bold('Base row of the day')}<br>ANNEE, MOIS, JOUR + 20 product slots (ET to LQ)`],
  ['fixed', `${bold('Step 1: keep filled slots')}<br>shift = Semaine Matin ... Weekend Nuit, slot PF1 to PF4`],
  ['have', `${bold('Plan_OPT_EU row')}<br>one per filled slot (IWKA 2 on 23 Oct: 5 rows)`],
]);
y5 = mapping(p5, y5, [
  ['Date', '2026-10-23', 'ANNEE / MOIS / JOUR (or column Date)', 'have', 'Excel serial number in the macro sheets; text YYYY-MM-DD in the table'],
  ['MachineName', 'IWKA 2', 'line name from the file name "OEE IWKA 2 - 2026"', 'fixed', 'check it equals the report name in Machine Names'],
  ['ShiftName', 'Semaine Matin (macro: 1)', 'the shift type of the slot (5 types)', 'test', 'EU tables use names like Day / Night: a mapping of the 5 types is needed'],
  ['AreaName', 'CREAM (macro: CREAM)', 'macro writes the group; EU uses site + area (Hull Dries)', 'test', 'decide the Chartres area names'],
  ['PartName', '<Nom PF1 Semaine Matin>', 'Nom PF<n> <shift>', 'test', 'the macro writes a lookup whose value differs per line; use the Nom column and compare'],
  ['Good Parts', '3006', 'Volume PF1 Semaine Matin', 'have', 'macro rule, equal on all rows of 10 files. It ignores Déchets: decide whether to subtract waste'],
  ['Capacity', '7200', 'Vitesse x Temps = 80 x 90', 'have', 'macro: Target = Capacity = this product'],
  ['Total Time', '90', 'Temps PF1 Semaine Matin (minutes run)', 'have', 'macro rule, equal on all rows'],
  ['Planned OpT', '(macro: empty)', 'none in the files. Candidate: Temps of the slot', 'test', 'Plan_OPT_EU needs it. In the Hull files Planned OpT can be lower than Total Time (planned stops)'],
  ['OEE Time', '(macro: empty)', 'Volume / Vitesse = 3006 / 80 = 37.6 minutes', 'test', 'supported by TU (Base): the day total equals the sum of Volume / Vitesse in 9 of 10 files'],
  ['Downtime Units', '4194', 'Capacity - Good Parts', 'have', 'macro rule, equal on all rows'],
  ['SiteName', 'Chartres', 'fixed', 'fixed', ''],
  ['Unique Machine Name', 'IWKA 2-Chartres', 'MachineName + "-Chartres" (as B2 Auto-Hull)', 'fixed', ''],
  ['Product Key', 'IWKA 2-Chartres <part>', 'Unique Machine Name + space + PartName', 'fixed', 'built the report way'],
  ['UPDT Target, PDT Target, OEE Target', '-', 'targets (Glidepaths) by machine and month', 'none', 'not in the Chartres files; empty until Reckitt gives Chartres targets'],
  ['Dept, Area, Product Type', '-', 'Machine Names lookup', 'none', 'Chartres lines are not in Machine Names yet'],
  ['Data Source', '-', 'new value, for example "Chartres Excel"', 'test', 'Provideam / SIH exist today'],
]);

const p6 = new Page('6 Base to Time_Utilisation_EU', 6);
title(p6, 'Base -> Time_Utilisation_EU (one row per day and machine)',
  'Grain: one row per day of a line, from the day totals of Base (E to H). Meaning of TOP, TOR, TU from formulas and numbers (page 3), to confirm.');
legend(p6, 40, 90, ['have', 'fixed', 'test', 'none']);
let y6 = flow(p6, 140, [
  ['table', `${bold('Base row of the day')}<br>TOP, TOR, TU, NR (E to H)`],
  ['fixed', `${bold('Step 1: one row per day')}<br>no unpivot, the columns are read as they are`],
  ['have', `${bold('Time_Utilisation_EU row')}<br>one per line and day`],
]);
y6 = mapping(p6, y6, [
  ['Date', '2026-10-23', 'ANNEE / MOIS / JOUR', 'have', ''],
  ['MachineName', 'IWKA 2', 'file name', 'fixed', ''],
  ['OEE Time Total', '161', 'TU (Temps Utile)', 'test', 'TU = sum of Volume / Vitesse (161.3), 9 of 10 files. HOME 3 differs (427 vs 458): check the waste columns'],
  ['Total Time Total', '900', 'TOP (scheduled opening time)', 'test', 'candidate; the alternative is the sum of Temps of the slots (MZ). Same value in IWKA 2'],
  ['Planned OPT Total', '900', 'TOR (TOP minus time not counted)', 'test', 'TOP and TOR differ when TownHall, trials, training or validation minutes exist (for example 1410 vs 1340)'],
  ['All Time', '1440', 'fixed 1440 per day', 'fixed', 'as in the other sites'],
  ['SiteName, Unique Machine Name', 'Chartres, IWKA 2-Chartres', 'as Plan_OPT_EU', 'fixed', ''],
  ['Dept, Area, Product Type', '-', 'Machine Names lookup', 'none', 'Chartres lines not in Machine Names yet'],
  ['Data Source', '-', 'new value', 'test', ''],
]);
y6 += 20;
const CHECK6 = bold('Check built into the workbook: ') + 'Vérification TO = TU + NR + the eight loss totals and equals TOR on every day shown (IWKA 2: 161 + 739 = 900). '
  + 'So the day is always fully accounted for, and the losses of Daily_Losses_EU add up to TOR - TU.';
p6.box(40, y6, 1510, fit(1510, CHECK6), CHECK6, 'have');

const p7 = new Page('7 Base to Daily_Losses_EU', 7);
title(p7, 'Base -> Daily_Losses_EU (one row per day and loss column with minutes)',
  'Grain: every loss column of Base with a value above 0 becomes a row (IWKA 2 on 23 Oct: 17 rows, 739 minutes). Group / sub group / description come from the sheet Category (French name -> Level 1, 2, 3 in English), not from the macro export.');
legend(p7, 40, 90, ['have', 'fixed', 'test', 'none', 'warn']);
let y7 = flow(p7, 140, [
  ['table', `${bold('Base row of the day')}<br>141 loss columns (I to ES) in minutes`],
  ['fixed', `${bold('Step 1: unpivot')}<br>one row per column with minutes > 0, "Nbre" count columns left out`],
  ['fixed', `${bold('Step 2: Category lookup')}<br>French name -> Level 1 / 2 / 3 EN`],
  ['have', `${bold('Daily_Losses_EU row')}<br>per day and loss`],
]);
y7 = mapping(p7, y7, [
  ['Date, ShiftStartDate', '2026-10-23', 'ANNEE / MOIS / JOUR', 'have', ''],
  ['MachineName', 'IWKA 2', 'file name', 'fixed', ''],
  ['OEELossLvl3Group', 'Unplanned losses', 'Category level 1 (EN) of the French column name', 'have', 'e.g. "Réglages REMPLISSEUSE - Scellage Tubes" -> Unplanned losses'],
  ['OEELossLvl3SubGroup', 'Adjustment', 'Category level 2 (EN)', 'have', 'the macro export writes "Minor stop" here: decide (page 2)'],
  ['OEELossLvl3Desc', 'Filling machine', 'Category level 3 (EN)', 'have', ''],
  ['Duration', '310', 'the minutes in that column', 'have', 'whole minutes; the EU extract also has whole minutes'],
  ['Breakdown Types, Loss Final Level, Equipment', 'Adjustment / Filling machine', 'Breakdown Types = sub group; Loss Final Level = level 3 name; Equipment = machine description', 'test', 'built the report way in the other sites (docs/pbi-report-build.md)'],
  ['ShiftName', '-', 'NONE: Base losses are per day, not per shift', 'none', 'empty, or share the day by the minutes of each shift (decision)'],
  ['PartName, Product Key, Batch ID', '-', 'NONE: losses are not tied to a product slot', 'none', 'empty, or the product with most minutes of the day (decision)'],
  ['Time', '-', 'NONE: no start time of a stop', 'none', 'the EU extract has the shift start (06:00); empty or shift start'],
  ['Comment', '-', 'NONE', 'none', 'Base has no free text'],
  ['Loss Units', '-', 'Vitesse x Duration (design speed x minutes, as in the other sites)', 'test', 'needs a speed: the day has up to 20 speeds, take the product of the day with most minutes'],
  ['Volume Total', '-', 'sum of Capacity of the machine and day (Plan_OPT_EU)', 'test', 'built from the Plan_OPT_EU rows'],
  ['Volume Key, Loss Target Key, Value', '-', 'Volume Key = dd/MM/yyyy machine group sub desc; Loss Target Key = unique name + sub group + month start; Value = target of Glidepaths', 'none', 'keys can be built; Value needs Chartres targets, which are not in the files'],
  ['SiteName, Unique Machine Name, Dept, Area, Product Type, Data Source', '-', 'as Plan_OPT_EU', 'fixed', 'Dept, Area, Product Type need Machine Names for Chartres'],
]);
y7 += 20;
const LOSSNOTE = bold('Rows that need a decision: ') + 'NR (no accounted time) -> Undefined / Unplanned losses; TownHall, Formation -> "Production not scheduled"; '
  + 'Essais Planifiés, Validation -> "NPD/CapEX & Trials". Other sites keep these groups out of the loss % or not: to check against how Hull and Nottingham treat them.';
p7.box(40, y7, 1510, fit(1510, LOSSNOTE), LOSSNOTE, 'warn');

// ---- Page 8: questions ---------------------------------------------------------------
const p8 = new Page('8 Questions', 8);
title(p8, 'Open questions and decisions before building anything',
  'Nothing is built yet. Order = what blocks the mapping first.');
const QUESTIONS = [
  ['none', 'DOR L3: which file is the OEE source? No OEE*.xlsm exists for this group (Laura).'],
  ['test', 'Source: Base directly with the Category sheet (your preference) and the macro exports only as a test of our rows (Aug to Oct 2026 daily, January monthly). Agreed?'],
  ['warn', 'The macro export maps Panne and Réglages to "Minor stop" and every "Autre" to Planned / Cleaning. The Category sheet says Breakdown, Adjustment, Unplanned. Which is the intended result for the report?'],
  ['warn', 'Good Parts: Volume as the macro does, or Volume - Déchets as the OEE sheet does? NON TISSE has waste per machine as well.'],
  ['test', 'Meaning of TOP, TOR, TU, NR, and which of them are Total Time, Planned OpT and OEE Time (Time_Utilisation_EU and Plan_OPT_EU).'],
  ['test', 'Losses are per day, not per shift or product: leave ShiftName, PartName and Time empty, or spread them? Spread by what?'],
  ['test', 'Shift names: the 5 types (weekday morning / afternoon / night, weekend morning / night) to Day / Night or to their own names?'],
  ['none', 'Chartres lines in Machine Names (Dept, Area, Product Type, report name) and Chartres targets (UPDT, PDT, OEE Target, Value).'],
  ['warn', 'Dates entered twice (CUMULUS 2025: 7, ZEUS 2025: 2): replace or add? Empty files (CUPIDON, DAISY 2026): ignore.'],
  ['warn', 'Time not counted (TownHall, trials, training, validation): in the losses table or out?'],
  ['fixed', 'Optional: read the macro source code (static, not run) to settle the questions above. It needs an extraction tool for the VBA project; I will not do it without your go.'],
];
let y8 = 100;
QUESTIONS.forEach(([level, text], i) => {
  const html = `${bold(`${i + 1}.`)} ${esc(text)}`;
  const h = fit(1400, plain(html));
  p8.box(40, y8, 1400, h, html, level);
  y8 += h + 8;
});

const pages = [p1, p2, p3, p4, p5, p6, p7, p8];
writeFileSync(OUTPUT, `<mxfile host="build-drawio-chartres.js">${pages.map((p) => p.xml()).join('')}</mxfile>`);
console.log(`Wrote ${OUTPUT} (${pages.length} pages)`);
