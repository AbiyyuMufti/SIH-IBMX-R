// Builds the PowerPoint that explains the Chartres conversion to the site: one real day
// (workbook values on the left, SIH rows on the right), the empty columns, the loss names
// and the questions. Same data as scripts/chartres-explain-html.js.
// Usage: PPTXGENJS_DIR=<folder with node_modules/pptxgenjs> PPTX_SKILL_DIR=<pptx skill folder>
//        node scripts/chartres-explain-pptx.js <out of chartres-convert> [deck.pptx]
// Reads <out>/review.json and the stage rows of the example day. The deck holds site values:
// it is git-ignored, never commit it.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const OUT = process.argv[2];
const DECK = process.argv[3] ?? 'prompt-response/chartres-how-it-works-for-laura.pptx';
if (!OUT) {
  console.error('usage: node scripts/chartres-explain-pptx.js <out of chartres-convert> [deck.pptx]');
  process.exit(1);
}
const require = createRequire(`${process.env.PPTXGENJS_DIR ?? process.cwd()}/`);
const pptxgen = require('pptxgenjs');
const { applyTheme } = createRequire(import.meta.url)(join(process.env.PPTX_SKILL_DIR ?? '.', 'scripts', 'apply_theme.js'));

const review = JSON.parse(readFileSync(join(OUT, 'review.json'), 'utf8'));
const { example, facts } = review;
const [intro, dayBlock, productBlock, stopBlock] = example.blocks;
const [, line, date] = intro.title.match(/Example: (.+), (\d{4}-\d{2}-\d{2})/);
const niceDate = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const isoOf = (dayNo) => new Date(dayNo * 86400000).toISOString().slice(0, 10);
const stage = (table, name) => JSON.parse(readFileSync(join(OUT, 'stage', table, 'site=Chartres', name), 'utf8')).rows;
const month = date.slice(0, 7);
const mine = (r) => r.MachineName === line && isoOf(r.Date) === date;
const plan = stage('Plan_OPT_EU', `Plan_OPT_EU_${month}_excel.json`).filter(mine);
const loss = stage('Daily_Losses_EU', `Daily_Losses_EU_${month}_excel.json`).filter(mine);
const cov = stage('Volume_CoV_EU', `Volume_CoV_EU_${month}_excel.json`).filter(mine);
const formatRows = stage('Format_List_EU', 'Format_List_EU.json').filter((r) => r.MachineName === line && plan.some((p) => p.PartName === r['Product Name']));
const sheetRows = (name) => review.sheets.find((s) => s.name.startsWith(name)).blocks[1].rows.length;
const n = (v) => (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v ?? ''));

// ---- Theme: the workbook side is amber, the SIH side is blue ----
const THEME = {
  name: 'Chartres conversion',
  headFontFace: 'Cambria',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '1D2733',
    lt1: 'FFFFFF',
    dk2: '14283D',
    lt2: 'EEF2F6',
    accent1: '3B82C4',
    accent2: 'D98E1F',
    accent3: '2E8B57',
    accent4: '5B6B7B',
    accent5: 'B85450',
    accent6: '6C8EBF',
    hlink: '3B82C4',
    folHlink: '5B6B7B',
  },
};
const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = 'Chartres OEE history: how your workbooks become SIH tables';
const C = pres.SchemeColor;

pres.defineSlideMaster({
  title: 'TITLE',
  background: { color: C.text2 },
  objects: [],
  slideNumber: undefined,
});
pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.3, w: 9, h: 0.75, fontSize: 30, bold: true, color: C.text2, align: 'left', valign: 'middle', margin: 0 }, text: '' } },
  ],
  slideNumber: { x: 9.1, y: 5.2, w: 0.5, h: 0.3, fontSize: 10, color: C.accent4 },
});
pres.addSection({ title: 'Chartres conversion' });

// ---- Helpers ----
const cell = (text, o = {}) => ({ text: n(text), options: { fontSize: 12, color: C.text1, valign: 'middle', ...o } });
const head = (labels, fill, widths) =>
  labels.map((t) => ({ text: t, options: { fontSize: 11, bold: true, color: C.background1, fill: { color: fill }, valign: 'middle' } }));
const arrowCell = () => cell('→', { align: 'center', color: C.accent4, fontSize: 14, bold: true });
const noteBox = (slide, text, y, name) => {
  slide.addShape(pres.ShapeType.roundRect, { x: 0.5, y, w: 9, h: 0.7, rectRadius: 0.08, fill: { color: C.accent3, transparency: 88 }, line: { color: C.accent3, width: 1 }, objectName: `${name} box` });
  slide.addText(text, { x: 0.65, y, w: 8.7, h: 0.7, fontSize: 14, color: C.text1, valign: 'middle', isTextBox: true, margin: 0, objectName: name });
};
const contentSlide = (title, notes) => {
  const slide = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Chartres conversion' });
  slide.addText(title, { placeholder: 'title' });
  slide.addNotes(notes);
  return slide;
};

// ---- 1. Title ----
{
  const s = pres.addSlide({ masterName: 'TITLE', sectionTitle: 'Chartres conversion' });
  s.addText('Chartres OEE history', { x: 0.7, y: 1.3, w: 8.6, h: 0.9, fontSize: 44, bold: true, color: C.background1, fontFace: THEME.headFontFace, isTextBox: true, margin: 0, objectName: 'Title' });
  s.addText('How your workbooks become SIH tables', { x: 0.7, y: 2.25, w: 8.6, h: 0.6, fontSize: 24, color: C.background1, isTextBox: true, margin: 0, objectName: 'Subtitle' });
  s.addText('Draft for your review: 36 workbooks, 2025 and 2026. Nothing is loaded in SIH yet.', { x: 0.7, y: 3.2, w: 8.6, h: 0.5, fontSize: 16, color: C.background2, isTextBox: true, margin: 0, objectName: 'Note' });
  s.addNotes('Purpose: show how we convert the OEE workbooks, with one real day, and ask for the answers on the last slides.');
}

// ---- 2. The idea ----
{
  const s = contentSlide('One workbook row, 5 SIH tables', 'One row of the sheet Base is one line and one day. The first three tables come straight from it, the last two are calculated from the products.');
  s.addShape(pres.ShapeType.roundRect, { x: 0.5, y: 1.3, w: 3.1, h: 3.55, rectRadius: 0.1, fill: { color: C.accent2, transparency: 85 }, line: { color: C.accent2, width: 1.5 }, objectName: 'Workbook box' });
  s.addText(
    [
      { text: 'Your workbook', options: { bold: true, fontSize: 18, breakLine: true } },
      { text: `OEE ${line} - 2026, sheet Base`, options: { fontSize: 14, breakLine: true } },
      { text: `One row = ${line}, ${niceDate}`, options: { fontSize: 14, breakLine: true } },
      { text: ' ', options: { fontSize: 8, breakLine: true } },
      { text: 'times (TOR, TU)', options: { fontSize: 14, bullet: true, breakLine: true } },
      { text: 'products (shift, volume, waste, speed)', options: { fontSize: 14, bullet: true, breakLine: true } },
      { text: 'minutes lost, one column per stop', options: { fontSize: 14, bullet: true } },
    ],
    { x: 0.7, y: 1.4, w: 2.75, h: 3.35, color: C.text1, valign: 'top', isTextBox: true, margin: 0, paraSpaceAfter: 4, objectName: 'Workbook text' },
  );
  s.addShape(pres.ShapeType.rightArrow, { x: 3.7, y: 2.8, w: 0.6, h: 0.5, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: 'Arrow' });
  const tables = [
    ['Time_Utilisation_EU', `${dayBlock.rows.length ? 1 : 0} row`, 'the day: opening time and useful time'],
    ['Plan_OPT_EU', `${plan.length} rows`, 'one per product and shift'],
    ['Daily_Losses_EU', `${loss.length} rows`, 'one per stop with minutes'],
    ['Volume_CoV_EU', `${cov.length} rows`, 'calculated from the products'],
    ['Format_List_EU', `${formatRows.length} row${formatRows.length === 1 ? '' : 's'}`, 'brand and format of the products'],
  ];
  tables.forEach(([name, rows, what], i) => {
    const y = 1.3 + i * 0.73;
    s.addShape(pres.ShapeType.roundRect, { x: 4.5, y, w: 5, h: 0.62, rectRadius: 0.08, fill: { color: C.accent1, transparency: 85 }, line: { color: C.accent1, width: 1.25 }, objectName: `${name} box` });
    s.addText(
      [
        { text: `${name}  `, options: { bold: true, fontSize: 15 } },
        { text: `${rows}`, options: { bold: true, fontSize: 15, color: C.accent1 } },
        { text: `\n${what}`, options: { fontSize: 12, color: C.accent4 } },
      ],
      { x: 4.65, y, w: 4.75, h: 0.62, color: C.text1, valign: 'middle', isTextBox: true, margin: 0, objectName: `${name} text` },
    );
  });
}

// ---- 2b. Overview: how the columns flow into the tables ----
{
  // Columns that ever held minutes, per line: the range over all lines.
  const perLine = {};
  JSON.parse(readFileSync(join(OUT, 'loss-map.json'), 'utf8')).forEach((e) => {
    const c = (perLine[e.line] ??= { planned: 0, unplanned: 0 });
    c[e.OEELossLvl3Group === 'Planned Loss' ? 'planned' : 'unplanned'] += 1;
  });
  const range = (k) => {
    const v = Object.values(perLine).map((c) => c[k]);
    return `${Math.min(...v)} to ${Math.max(...v)}`;
  };
  const s = contentSlide(
    'Overview: where the columns go',
    'The sheet Base has 383 columns per line (404 for some NON TISSE lines). About 285 are loaded. Losses are one column per stop type, but only the columns with minutes above 0 become a row in Daily_Losses_EU. Products are 5 shift types x 4 product slots x 6 fields; only the filled slots become rows in Plan_OPT_EU.',
  );
  const o = { fontSize: 10.5 };
  const b = { fontSize: 10.5, bold: true };
  const g = { fontSize: 10.5, color: C.accent4 };
  const mid = { align: 'center' };
  const body = [
    [cell('Date: year, month, day', o), cell('3', { ...o, ...mid }), cell('every table', b), cell('Date (text YYYY-MM-DD)', o)],
    [cell('Times: TOR, TU, OEE', o), cell('3', { ...o, ...mid }), cell('Time_Utilisation_EU', b), cell('Total Time, Planned OPT, OEE Time, OEE. 1 row per line and day', o)],
    [cell('Products per shift: code, name, volume, waste, speed, time', o), cell('120 (5×4×6)', { ...o, ...mid }), cell('Plan_OPT_EU', b), cell('Shift, PartName, Good Parts, Capacity, Total Time. 1 row per product and shift (filled slots only)', o)],
    [cell('Planned losses in minutes: cleaning, changeovers, start-up, planned maintenance', o), cell(`${range('planned')} used per line`, { ...o, ...mid }), cell('Daily_Losses_EU', b), cell('Type "Planned Loss", name, minutes. 1 row per column with minutes above 0', o)],
    [cell('Unplanned losses in minutes: stops, breakdowns, adjustments, slow speed, shortages, NR', o), cell(`${range('unplanned')} used per line`, { ...o, ...mid }), cell('Daily_Losses_EU', b), cell('Type "Unplanned Loss", name, minutes. Same rule', o)],
    [cell('No column: calculated from the product rows', o), cell('0', { ...o, ...mid }), cell('Volume_CoV_EU', b), cell('Good Parts Sum and Cap Max per shift', o)],
    [cell('Sheet Data (not Base): brand, size, units per case', o), cell('-', { ...o, ...mid }), cell('Format_List_EU', b), cell('Brand, Unit Size, Unit Count/Format', o)],
    [cell('Not loaded: totals, checks, TOP, people, safety, counters', g), cell('about 100', { ...g, ...mid }), cell('none', g), cell('Used by the entry form to check the day, or empty', g)],
  ];
  s.addTable(
    [
      [
        ...['Topic in your workbook (sheet Base)', 'Columns used'].map((t) => ({ text: t, options: { fontSize: 11, bold: true, color: C.background1, fill: { color: C.accent2 }, valign: 'middle' } })),
        ...['Goes to table', 'What lands there'].map((t) => ({ text: t, options: { fontSize: 11, bold: true, color: C.background1, fill: { color: C.accent1 }, valign: 'middle' } })),
      ],
      ...body,
    ],
    { x: 0.5, y: 1.1, w: 9, colW: [3.0, 1.2, 1.6, 3.2], rowH: 0.36, border: { type: 'solid', pt: 0.75, color: C.background2 }, objectName: 'Overview table' },
  );
  s.addText('Of the 383 columns of a CREAM workbook, about 285 are used. A stop column with 0 minutes on a day gives no row.', { x: 0.5, y: 5.12, w: 8.4, h: 0.3, fontSize: 11, bold: true, color: C.text1, isTextBox: true, margin: 0, objectName: 'Overview note' });
}

// ---- 3. The day ----
{
  const s = contentSlide('The day: 1 row in Time_Utilisation_EU', 'Time_Utilisation_EU. Total Time is TOR and OEE Time is TU. OEE is always TU / TOR, as you confirmed.');
  s.addText('In your workbook', { x: 0.5, y: 1.2, w: 4.2, h: 0.35, fontSize: 16, bold: true, color: C.accent2, isTextBox: true, margin: 0, objectName: 'Left label' });
  s.addText('In SIH', { x: 5.3, y: 1.2, w: 4.2, h: 0.35, fontSize: 16, bold: true, color: C.accent1, isTextBox: true, margin: 0, objectName: 'Right label' });
  s.addTable([head(['Workbook', 'Value'], C.accent2), ...dayBlock.rows.map((r) => [cell(r[0].replace(/\s+/g, ' ')), cell(r[1], { align: 'right', bold: true })])], { x: 0.5, y: 1.6, w: 4.2, colW: [3.0, 1.2], rowH: 0.45, border: { type: 'solid', pt: 0.75, color: C.background2 }, objectName: 'Workbook values' });
  s.addShape(pres.ShapeType.rightArrow, { x: 4.8, y: 2.5, w: 0.4, h: 0.4, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: 'Arrow' });
  s.addTable([head(['SIH column', 'Value'], C.accent1), ...dayBlock.rows.map((r) => [cell(r[3].replace(/\s+/g, ' ')), cell(r[4], { align: 'right', bold: true })])], { x: 5.3, y: 1.6, w: 4.2, colW: [3.0, 1.2], rowH: 0.45, border: { type: 'solid', pt: 0.75, color: C.background2 }, objectName: 'SIH values' });
  noteBox(s, 'Table Time_Utilisation_EU: 1 row per line and day, made from 3 columns of your workbook (TOR, TU, OEE).', 3.6, 'Table note');
  noteBox(s, 'TOP (planned time) and the not-counted time are only used to check the day. OEE is always on TOR: you confirmed it.', 4.4, 'Rule');
}

// ---- 4. The products ----
{
  const s = contentSlide(`The products: ${plan.length} rows in Plan_OPT_EU`, 'Plan_OPT_EU. One row per product of each shift. Good Parts = Volume - Déchets, Capacity = Vitesse x Temps. Matin is Day, Après Midi is Afternoon, Nuit is Night.');
  const rows = productBlock.rows;
  const body = rows.map((r, i) => {
    const total = r[0] === 'Total';
    const o = { bold: total, fontSize: 11 };
    return [cell(r[0], o), cell(r[1], o), cell(r[2], { ...o, align: 'right' }), cell(r[3], { ...o, align: 'right' }), cell(r[4], { ...o, align: 'right' }), cell(r[5], { ...o, align: 'right' }), arrowCell(), cell(r[7], o), cell(r[8], { ...o, align: 'right' }), cell(r[9], { ...o, align: 'right' })];
  });
  s.addTable(
    [
      [
        ...['Shift', 'Product', 'Volume', 'Déchets', 'Vitesse', 'Temps'].map((t) => ({ text: t, options: { fontSize: 11, bold: true, color: C.background1, fill: { color: C.accent2 } } })),
        { text: '', options: { fill: { color: C.background1 } } },
        ...['SIH shift', 'Good Parts', 'Capacity'].map((t) => ({ text: t, options: { fontSize: 11, bold: true, color: C.background1, fill: { color: C.accent1 } } })),
      ],
      ...body,
    ],
    { x: 0.5, y: 1.3, w: 9, colW: [1.2, 2.2, 0.75, 0.75, 0.7, 0.7, 0.3, 0.85, 0.75, 0.75], rowH: 0.42, border: { type: 'solid', pt: 0.75, color: C.background2 }, objectName: 'Products table' },
  );
  noteBox(s, `Table Plan_OPT_EU: 1 row per product and shift. Each shift has 4 product slots; on ${niceDate} ${plan.length} slots are filled, so ${plan.length} rows. Empty slots give no row.`, 3.65, 'Table note');
  noteBox(s, 'SIH Good Parts = Volume − Déchets.   SIH Capacity = Vitesse × Temps.   Shift: Matin = Day, Après Midi = Afternoon, Nuit = Night.', 4.5, 'Rule');
}

// ---- 5. The stops (two slides: 14 rows do not fit on one) ----
{
  const all = stopBlock.rows;
  const stops = all.slice(0, -1);
  const total = [...all.at(-1)];
  total[5] = '= TOR − TU';
  const half = Math.ceil(stops.length / 2);
  const ever = JSON.parse(readFileSync(join(OUT, 'loss-map.json'), 'utf8')).filter((e) => e.line === line);
  const evPlanned = ever.filter((e) => e.OEELossLvl3Group === 'Planned Loss').length;
  const evUnplanned = ever.length - evPlanned;
  const notes = 'Daily_Losses_EU. Each workbook column with minutes becomes one row, with an English name. The total of the minutes equals TOR minus TU. "MASTERDATA" means the name comes from the SIH reason list, "to check" means we need your answer (sheets in the Excel).';
  [stops.slice(0, half), [...stops.slice(half), total]].forEach((part, i) => {
    const s = contentSlide(`Stops: ${stops.length} rows in Daily_Losses_EU (${i + 1}/2)`, notes);
    const body = part.map((r) => {
      const o = { bold: r[0] === 'Total', fontSize: 11 };
      return [cell(r[0], o), cell(r[1], { ...o, align: 'right' }), arrowCell(), cell(r[3], o), cell(r[4], o), cell(r[5], o), cell(r[6], { ...o, color: r[6] === 'to check' ? C.accent5 : C.text1 })];
    });
    s.addTable(
      [
        [
          ...['Column in your workbook', 'Minutes'].map((t) => ({ text: t, options: { fontSize: 11, bold: true, color: C.background1, fill: { color: C.accent2 } } })),
          { text: '', options: { fill: { color: C.background1 } } },
          ...['Group', 'Type', 'Name in SIH', 'Name from'].map((t) => ({ text: t, options: { fontSize: 11, bold: true, color: C.background1, fill: { color: C.accent1 } } })),
        ],
        ...body,
      ],
      { x: 0.5, y: 1.15, w: 9, colW: [2.2, 0.75, 0.3, 1.3, 1.5, 1.75, 1.2], rowH: 0.34, border: { type: 'solid', pt: 0.75, color: C.background2 }, objectName: `Stops table ${i + 1}` },
    );
    const noteY = 1.15 + 0.34 * (part.length + 1) + 0.2;
    const first = `On ${niceDate}, ${stops.length} loss columns of ${line} have minutes: they give ${stops.length} rows in Daily_Losses_EU. The other loss columns are 0 that day and are left out.`;
    const second = 'Each row has the type (Planned or Unplanned Loss), the group and the name from MASTERDATA, and the minutes. The total of the minutes is TOR − TU, as in your workbook.';
    noteBox(s, i === 0 ? first : second, noteY, 'Table note');
  });
}

// ---- 6. Two tables made from the products ----
{
  const s = contentSlide('Two more tables from the products', 'Volume_CoV_EU is calculated from Plan_OPT_EU with the same rule as the other sites. Format_List_EU is read from the sheet Data of the workbook.');
  s.addText('Volume_CoV_EU: per shift, the sum of Good Parts and the largest Capacity (kept when Good Parts > 1,000)', { x: 0.5, y: 1.15, w: 9, h: 0.35, fontSize: 14, bold: true, color: C.accent1, isTextBox: true, margin: 0, objectName: 'CoV label' });
  s.addTable([head(['Date', 'Shift', 'Good Parts Sum', 'Cap Max', 'Time on Shift (min)'], C.accent1), ...cov.map((r) => [cell(date), cell(r['Shift Colour']), cell(r['Good Parts Sum'], { align: 'right' }), cell(r['Cap Max'], { align: 'right' }), cell(r['Time on Shift'] / 60000, { align: 'right' })])], { x: 0.5, y: 1.55, w: 9, colW: [1.6, 1.8, 1.9, 1.7, 2.0], rowH: 0.36, border: { type: 'solid', pt: 0.75, color: C.background2 }, objectName: 'CoV table' });
  const y2 = 1.55 + 0.36 * (cov.length + 1) + 0.35;
  s.addText('Format_List_EU: brand, size and units per case, from the sheet Data of your workbook', { x: 0.5, y: y2, w: 9, h: 0.35, fontSize: 14, bold: true, color: C.accent1, isTextBox: true, margin: 0, objectName: 'Format label' });
  s.addTable([head(['Product', 'Brand', 'Unit size', 'Units per case', 'Extra info'], C.accent1), ...formatRows.map((r) => [cell(r['Product Name']), cell(r.Brand), cell(r['Unit Size']), cell(r['Unit Count/Format'], { align: 'right' }), cell(r['Extra Info'])])], { x: 0.5, y: y2 + 0.4, w: 9, colW: [3.4, 1.4, 1.2, 1.5, 1.5], rowH: 0.36, border: { type: 'solid', pt: 0.75, color: C.background2 }, objectName: 'Format table' });
}

// ---- 7. Empty columns ----
{
  const s = contentSlide('Columns that stay empty, and why', 'These columns exist in the SIH tables but Chartres has nothing to put in them yet.');
  const rows = [
    ['Dept, Area, Product Type', 'Where the line sits in the plant. Needs the Chartres reference file (to come).'],
    ['UPDT Target, PDT Target', 'Downtime targets from the glidepaths. The target file has OEE only (OEE Target is filled).'],
    ['Value, target', 'Monthly target of the loss group. Same: needs the glidepaths.'],
    ['PartName, Product Key, Shift, Time', 'On the stops: the workbook counts stops per day, not per product or shift.'],
    ['Comment', 'The workbook has no comment per stop. They will come with the SIH entry.'],
  ];
  s.addTable([head(['Column', 'Why it is empty'], C.accent4), ...rows.map((r) => [cell(r[0], { bold: true, fontSize: 13 }), cell(r[1], { fontSize: 13 })])], { x: 0.5, y: 1.3, w: 9, colW: [3.0, 6.0], rowH: 0.6, border: { type: 'solid', pt: 0.75, color: C.background2 }, objectName: 'Empty columns table' });
}

// ---- 8. Loss names ----
{
  const s = contentSlide('Loss names: what we ask you', 'SIH stores an English name from MASTERDATA, the reason list of the SIH entry page. The Excel has three sheets, sorted by the minutes lost. A machine part has 3 workbook columns (Dysf, Panne, Réglages) shown as one row.');
  const cards = [
    ['1  MASTERDATA name', sheetRows('1 MASTERDATA'), 'The name exists in MASTERDATA. "Same name" should be right; "our proposal" needs a real check.', C.accent1],
    ['2  Category, no MASTERDATA', sheetRows('2 No MASTERDATA (Cat'), 'Not in MASTERDATA. The English is the translation of your own Category sheet. OK?', C.accent6],
    ['3  Our translation', sheetRows('3 No MASTERDATA (our'), 'CUPIDON and DAISY (dropped in 2026). The English is our translation. OK?', C.accent2],
  ];
  cards.forEach(([title, count, what, color], i) => {
    const x = 0.5 + i * 3.05;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.25, w: 2.9, h: 2.0, rectRadius: 0.1, fill: { color, transparency: 88 }, line: { color, width: 1.25 }, objectName: `Sheet ${i + 1} box` });
    s.addText(
      [
        { text: title, options: { bold: true, fontSize: 15, breakLine: true } },
        { text: `${count} rows`, options: { bold: true, fontSize: 24, color, breakLine: true } },
        { text: what, options: { fontSize: 13 } },
      ],
      { x: x + 0.15, y: 1.35, w: 2.6, h: 1.8, color: C.text1, valign: 'top', isTextBox: true, margin: 0, paraSpaceAfter: 4, objectName: `Sheet ${i + 1} text` },
    );
  });
  s.addText(
    [
      { text: 'Answer Yes or No in the yellow cells; if No, write or choose the right name.', options: { bold: true, fontSize: 15, breakLine: true } },
      { text: 'Machine part (3 columns) = Dysf, Panne and Réglages of the same part, shown as one row. Reason (1 column) = one column for the whole line, e.g. Nettoyage.', options: { fontSize: 13 } },
    ],
    { x: 0.5, y: 3.55, w: 9, h: 1.2, color: C.text1, valign: 'top', isTextBox: true, margin: 0, paraSpaceAfter: 6, objectName: 'Loss names answer' },
  );
}

// ---- 9. Questions ----
{
  const s = contentSlide('Questions for you', 'The same questions are in the Excel, sheet Questions, with one real case each.');
  const q = [
    'Good Parts = Volume − Déchets: is this the right way to count?',
    'Night shifts end after midnight: do you type them on the day they started or ended?',
    `NR is below 0 on ${facts.negativeDays} days (e.g. -1): what does it mean?`,
    `${facts.duplicateDays} days were entered twice: do we keep the last saved?`,
    `${facts.brokenDays.toLocaleString('en-US')} days break a rule of the entry form: known errors?`,
    '2025 targets: a file, or use the 2026 targets?',
    'Sheet Data: FORMAT "200ml - Cap" = size + extra info, CASE "X6" = 6 per case?',
    'Temps non compté Libre 1 on ZEUS: what was it for?',
  ];
  s.addText(
    q.map((t, i) => ({ text: t, options: { bullet: { type: 'number', numberStartAt: i + 1 }, fontSize: 15, breakLine: i < q.length - 1 } })),
    { x: 0.5, y: 1.2, w: 9, h: 3.8, color: C.text1, valign: 'top', isTextBox: true, margin: 0, paraSpaceAfter: 8, objectName: 'Questions' },
  );
}

await pres.writeFile({ fileName: DECK });
await applyTheme(DECK, THEME);
console.log(`${DECK}: ${pres.slides.length} slides`);
