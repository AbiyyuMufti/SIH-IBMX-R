// Builds one self-contained HTML page that explains the Chartres conversion with the real
// example day of the review (workbook cells -> rule -> SIH rows) and says where the files are.
// Usage: node scripts/chartres-explain-html.js <out of chartres-convert> [page.html] [for=site]
// for=site: the version for the site (no file paths, "you" instead of "Laura"); print it to PDF with
//   msedge --headless --print-to-pdf=<pdf> <page.html>
// Reads <out>/review.json (Example day sheet) and the stage rows of that day.
// The page holds site values: it is git-ignored, never commit it.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const FOR_SITE = process.argv.includes('for=site');
const PAGE = process.argv.slice(3).find((a) => !a.includes('=')) ?? 'prompt-response/chartres-how-it-works.html';
if (!OUT) {
  console.error('usage: node scripts/chartres-explain-html.js <out folder of chartres-convert>');
  process.exit(1);
}
const review = JSON.parse(readFileSync(join(OUT, 'review.json'), 'utf8'));
const example = review.example;
const [intro, dayBlock, productBlock, stopBlock] = example.blocks;
const [, line, date] = intro.title.match(/Example: (.+), (\d{4}-\d{2}-\d{2})/);
const isoOf = (dayNo) => new Date(dayNo * 86400000).toISOString().slice(0, 10);
const stage = (table) =>
  JSON.parse(readFileSync(join(OUT, 'stage', table, 'site=Chartres', `${table}_${date.slice(0, 7)}_excel.json`), 'utf8')).rows.filter(
    (r) => r.MachineName === line && isoOf(r.Date) === date,
  );
const util = stage('Time_Utilisation_EU')[0];
const plan = stage('Plan_OPT_EU');
const loss = stage('Daily_Losses_EU');
const cov = stage('Volume_CoV_EU');
const formatRows = JSON.parse(readFileSync(join(OUT, 'stage', 'Format_List_EU', 'site=Chartres', 'Format_List_EU.json'), 'utf8')).rows.filter((r) => r.MachineName === line && plan.some((p) => p.PartName === r['Product Name']));
const days = JSON.parse(readFileSync(join(OUT, 'days.json'), 'utf8')).days;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : esc(v));
const table = (head, rows, cls = '') =>
  `<table class="${cls}"><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${fmt(c)}</td>`).join('')}</tr>`)
    .join('')}</table>`;
const kv = (obj) => table(['SIH column', 'Value'], Object.entries(obj).map(([k, v]) => [k, v ?? '(empty)']), 'kv');

const totals = { days: days.length, plan: days.reduce((t, d) => t + d.products, 0) };
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chartres: how the conversion works</title>
<style>
:root{--ink:#1d2733;--mute:#5b6b7b;--line:#d5dde5;--bg:#f6f8fa;--wb:#fff4e0;--wbl:#e0a030;--sih:#e6f2ff;--sihl:#3b82c4;--ok:#e3f4e3}
@media(prefers-color-scheme:dark){:root{--ink:#e6edf3;--mute:#9aa8b6;--line:#3a4654;--bg:#12171d;--wb:#3a2e14;--wbl:#c08a20;--sih:#14283d;--sihl:#4a90d0;--ok:#173317}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:40px 0 8px}h3{font-size:16px;margin:20px 0 6px}
p{margin:6px 0}.mute{color:var(--mute)}
table{border-collapse:collapse;font-size:13px;margin:6px 0;background:var(--bg)}
th,td{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}
th{background:rgba(128,128,128,.15)}td{font-variant-numeric:tabular-nums}
.big{display:grid;grid-template-columns:1fr 60px 1fr;gap:8px;align-items:center;margin:16px 0}
.box{border:2px solid;border-radius:8px;padding:10px 14px}
.wb{background:var(--wb);border-color:var(--wbl)}.sih{background:var(--sih);border-color:var(--sihl)}
.arrow{font-size:34px;text-align:center;color:var(--mute)}
.stack{display:grid;gap:8px}
.step{display:grid;grid-template-columns:minmax(0,1fr) 40px minmax(0,1fr);gap:8px;align-items:start}
.step .arrow{font-size:28px;padding-top:30px}
.rule{background:var(--ok);border:1px solid var(--line);border-radius:6px;padding:6px 10px;margin:8px 0;font-size:14px}
.num{display:inline-block;background:var(--ink);color:var(--bg);border-radius:50%;width:26px;height:26px;text-align:center;line-height:26px;margin-right:6px;font-weight:600}
.overflow{overflow-x:auto}
@media print{:root{--ink:#1d2733;--mute:#5b6b7b;--line:#d5dde5;--bg:#fff;--wb:#fff4e0;--wbl:#e0a030;--sih:#e6f2ff;--sihl:#3b82c4;--ok:#e3f4e3}main{max-width:none;padding:0}table,.box,.rule,.step,.big{break-inside:avoid}h2,h3{break-after:avoid}h2{margin-top:28px}}
@page{size:A4 landscape;margin:12mm}
@media(max-width:800px){.big,.step{grid-template-columns:1fr}.arrow{transform:rotate(90deg)}}
</style></head><body><main>
<h1>Chartres: how the workbooks become SIH tables</h1>
<p class="mute">Example: line ${esc(line)}, day ${esc(date)}. Every number below is real, from the converted data.</p>

${FOR_SITE ? '' : `<h2>Where is the result</h2>
<div class="overflow">${table(
  ['What', 'Where (on this computer)'],
  [
    ['The 5 SIH tables, ready to upload (parquet, 89 files)', `${OUT}/report/<table>/site=Chartres/<table>_<YYYY-MM>_excel.parquet`],
    ['The same rows as text (open with a JSON viewer)', `${OUT}/stage/<table>/site=Chartres/..._excel.json`],
    ['Days that break a rule of the entry form', `${OUT}/checks.csv`],
    ['Every loss column: name used, MASTERDATA match', `${OUT}/loss-map.json`],
    ['One day of all 5 tables as csv, for Laura', `prompt-response/chartres-one-day-${line}-${date}/*.csv`],
    ['The review file for Laura (loss names and questions)', 'prompt-response/chartres-review-for-laura.xlsx'],
    ['The command that does it all', 'node scripts/chartres-convert.js out=downloads/chartres-convert/<new folder>'],
  ],
)}</div>
<p class="mute">Nothing is uploaded to SIH yet. The tables: Time_Utilisation_EU, Plan_OPT_EU, Daily_Losses_EU (from the workbook row) and Volume_CoV_EU, Format_List_EU (derived, see step 4).</p>
`}
<h2>The idea in one picture</h2>
<p>Laura's workbook has <b>one row per line and per day</b> (sheet Base, 383 columns). SIH wants the same day as <b>three tables</b>:</p>
<div class="big">
  <div class="box wb"><b>1 workbook row</b><br>${esc(line)}, ${esc(date)}<br><span class="mute">times, products, minutes lost</span></div>
  <div class="arrow">→</div>
  <div class="stack">
    <div class="box sih"><b>Time_Utilisation_EU</b>: ${util ? 1 : 0} row<br><span class="mute">the day: opening time and useful time</span></div>
    <div class="box sih"><b>Plan_OPT_EU</b>: ${plan.length} rows<br><span class="mute">one per product made (per shift)</span></div>
    <div class="box sih"><b>Daily_Losses_EU</b>: ${loss.length} rows<br><span class="mute">one per type of stop with minutes</span></div>
    <div class="box sih"><b>Volume_CoV_EU</b>: ${cov.length} rows <span class="mute">(from the products, step 4)</span></div>
    <div class="box sih"><b>Format_List_EU</b>: ${formatRows.length} row(s) <span class="mute">(brand and format of the products, step 4)</span></div>
  </div>
</div>
<p class="mute">For all 36 workbooks: ${totals.days.toLocaleString('en-US')} days → ${totals.days.toLocaleString('en-US')} + ${totals.plan.toLocaleString('en-US')} + 77,122 rows. Names are in English: the shift (Matin = Day), the stops (MASTERDATA names where they match).</p>

<h2><span class="num">1</span>The day → Time_Utilisation_EU</h2>
<div class="step">
  <div><h3>In the workbook (sheet Base)</h3>${table(['Column', 'Value'], dayBlock.rows.map((r) => [r[0], r[1]]))}</div>
  <div class="arrow">→</div>
  <div><h3>In SIH (1 row)</h3>${kv({ MachineName: util.MachineName, Date: date, 'Total Time Total': util['Total Time Total'], 'OEE Time Total': util['OEE Time Total'], 'All Time': util['All Time'], 'Data Source': util['Data Source'] })}</div>
</div>
<div class="rule">Rule: <b>Total Time = TOR</b> (real opening time) and <b>OEE Time = TU</b> (useful time). OEE is always TU / TOR: Laura confirmed. TOP and the not-counted time are only used to check the day.</div>

<h2><span class="num">2</span>The products → Plan_OPT_EU</h2>
<p>The workbook has 5 shift types × 4 product slots per day. Each slot with a product becomes one row.</p>
<div class="overflow">${table(
  ['Workbook shift', 'Product', 'Volume', 'Déchets (waste)', 'Vitesse (speed)', 'Temps (min)'],
  productBlock.rows.filter((r) => r[0] !== 'Total').map((r) => r.slice(0, 6)),
)}</div>
<div class="rule">Rules: <b>Good Parts = Volume − Déchets</b> · <b>Capacity = Vitesse × Temps</b> · Total Time = Temps · shift: Matin = Day, Après Midi = Afternoon, Nuit = Night</div>
<h3>In SIH (${plan.length} rows)</h3>
<div class="overflow">${table(
  ['ShiftName', 'PartName', 'Good Parts', 'Capacity', 'Total Time', 'OEE Time', 'OEE Target'],
  plan.map((r) => [r.ShiftName, r.PartName, r['Good Parts'], r.Capacity, r['Total Time'], r['OEE Time'], r['OEE Target']]),
)}</div>

<h2><span class="num">3</span>The stops → Daily_Losses_EU</h2>
<p>Each workbook column with minutes above 0 becomes one row. The French column name is translated to English, with the MASTERDATA name where it matches.</p>
<div class="overflow">${table(
  ['Column in the workbook', 'Minutes', '→', 'SIH Planned / Unplanned', 'SIH type', 'SIH name', 'Name from'],
  stopBlock.rows.filter((r) => r[0] !== 'Total'),
)}</div>
<div class="rule">Check: the minutes add up to <b>TOR − TU</b> (${esc(example.blocks[1].rows[0][1])} − ${esc(example.blocks[1].rows[1][1])} = ${stopBlock.rows.at(-1)[1]}). The stops have no shift or product: the workbook counts them per day.</div>
<h3>One SIH row in full (the first stop)</h3>
${kv({ MachineName: loss[0].MachineName, Date: date, OEELossLvl3Group: loss[0].OEELossLvl3Group, OEELossLvl3SubGroup: loss[0].OEELossLvl3SubGroup, OEELossLvl3Desc: loss[0].OEELossLvl3Desc, Equipment: loss[0].Equipment, 'Time in Mins': loss[0]['Time in Mins'], 'Data Source': loss[0]['Data Source'] })}

<h2><span class="num">4</span>Two more tables, made from the products</h2>
<p><b>Volume_CoV_EU</b>: for each shift of the day, the sum of Good Parts and the largest Capacity (the Tableau page checks that volumes are steady). Kept only when Good Parts &gt; 1,000. It is calculated from the Plan_OPT_EU rows, the same rule as Hull, Nottingham and Weinheim.</p>
<div class="overflow">${table(['Date', 'Shift', 'Good Parts Sum', 'Cap Max', 'Time on Shift (min)'], cov.map((r) => [date, r['Shift Colour'], r['Good Parts Sum'], r['Cap Max'], r['Time on Shift'] / 60000]))}</div>
<p><b>Format_List_EU</b>: brand, size and units per case of each product, read from the sheet <i>Data</i> of the same workbook (columns BRAND, FORMAT, CASE). Our reading of FORMAT: "200ml - Cap" = size 200ml + extra info Cap. To confirm with Laura.</p>
<div class="overflow">${table(['Product Name', 'Brand', 'Unit Size', 'Unit Count/Format', 'Extra Info'], formatRows.map((r) => [r['Product Name'], r.Brand, r['Unit Size'], r['Unit Count/Format'], r['Extra Info']]))}</div>

<h2>Columns that are empty, and why</h2>
<div class="overflow">${table(
  ['Column', 'Table', 'What it is', 'Why empty for Chartres'],
  [
    ['Dept, Area, Product Type', 'all', 'Where the line sits in the plant (e.g. Hull: Liquids Pack / Liquids / Bottles). Comes from the site Machine Names file', 'Chartres has not sent its reference file yet (it comes with the glidepaths)'],
    ['UPDT Target, PDT Target', 'Plan_OPT_EU', 'Target of unplanned and planned downtime, from the Glidepaths', 'The target file has OEE only. OEE Target IS filled (from Copie de Target 2026.xlsx)'],
    ['Value, target', 'Daily_Losses_EU', 'Monthly target of the loss group, joined with Loss Target Key', 'Same: needs the Glidepaths of Chartres'],
    ['PartName, Product Key, ShiftName, Time, Shift Time', 'Daily_Losses_EU', 'Which product / shift / time of the day the stop happened', 'The workbook counts stops per day, not per product or shift'],
    ['Comment', 'Daily_Losses_EU', 'The text an operator writes on a stop', 'The workbook has no comment per stop. They will come with the SIH entry'],
    ['source_hours, batch_id, comment_count', 'Plan_OPT_EU, Daily_Losses_EU', 'Fields of the Provideam system', 'Not applicable to an Excel source'],
  ],
)}</div>
<p class="mute">For comparison, filled columns: <b>PartName</b> (Plan_OPT_EU) = the product name the operator picks in the workbook (from its sheet Data). <b>Product Key</b> = line + product name, the key that links Plan_OPT_EU, Daily_Losses_EU and Format_List_EU. In the workbook of the previous conversion (macro export) PartName was a different Data column per file; we now take the name typed in the Base row.</p>

<h2>What Laura is asked</h2>
<p>1) That the left side of each step is really her data. 2) That the rules (green boxes) are right. 3) The loss names: 3 Excel sheets (name in MASTERDATA, no MASTERDATA but Category, no MASTERDATA and our translation). 4) The questions (sheet "Questions").</p>
</main></body></html>`;
const finalHtml = FOR_SITE
  ? html
      .replace(/Laura's workbook/g, 'Your workbook')
      .replace('What Laura is asked', 'What we ask you')
      .replace('Laura confirmed', 'you confirmed')
      .replace(/ To confirm with Laura./g, ' To confirm.')
      .replace(/ In the workbook of the previous conversion[^<]*?Base row./, '')
  : html;
writeFileSync(PAGE, finalHtml);
console.log(`${PAGE}: ${html.length} bytes`);
