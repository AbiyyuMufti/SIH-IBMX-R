// Builds diagrams/shift-report-data-map.drawio: what the shift (management)
// report needs and where each part can come from in Insights Hub.
// Page 1: sources -> proposed rpt_* tables -> report blocks.
// Page 2: every item of every block, coloured by availability.
// Page 3: what is not available. Text source: prompt-response/shift-report-data-map.md
// Usage: node scripts/build-drawio-shift-report.js
import { writeFileSync, mkdirSync } from 'node:fs';

const OUTPUT = 'diagrams/shift-report-data-map.drawio';

// ---- Levels and colours (same colours as the Power BI data map) ------------
const LEVEL = {
  have: { fill: '#d5e8d4', stroke: '#82b366', label: 'HAVE NOW' },
  api: { fill: '#fff2cc', stroke: '#d6b656', label: 'IN THE API, NEW FLOW' },
  test: { fill: '#ffe6cc', stroke: '#d79b00', label: 'TEST FIRST' },
  source: { fill: '#dae8fc', stroke: '#6c8ebf', label: 'NEW SOURCE (RECKITT)' },
  none: { fill: '#f8cecc', stroke: '#b85450', label: 'NOT AVAILABLE' },
  neutral: { fill: '#ffffff', stroke: '#666666', label: '' },
  table: { fill: '#f5f5f5', stroke: '#666666', label: '' },
};

// ---- Content -----------------------------------------------------------------
const SOURCES = [
  ['line', 'have', 'Line KPIs', 'evaluateKPIs on the line, per day and per hour'],
  ['order', 'have', 'Order and product', 'filterValues, filtered hourly KPIs, product collection'],
  ['stops', 'have', 'Line stops', 'downtimeReasons on the line'],
  ['history', 'have', 'Daily files in the lake', 'pbi_plan_opt history (30 days)'],
  ['machine', 'api', 'Machine KPIs and stops', '7 machine assets: evaluateKPIs, downtimeReasons (tested 2026-10-19)'],
  ['segments', 'api', 'Time segments', 'statusDistribution, timeModelCategoryDistribution (tested)'],
  ['counters', 'api', 'Reject counters', 'time series of the filler (cartoner to check)'],
  ['comments', 'source', 'Comment text', 'not used in Insights Hub (0 of 1997 stops); Provideam Mode Log has it'],
  ['reckitt', 'source', 'Reckitt files', 'SAP order quantity, costs, changeover and clean targets'],
];

// Three tables for all lines and all sites. A row says which line and
// machine it belongs to, so Tableau filters by line. rpt_counter is later.
const TABLES = [
  ['window', 'rpt_window', 'asset x window (day or shift). Line and machine rows: OEE, A, P, Q, parts, capacity, losses in units, time per group, counted, rejects'],
  ['hour', 'rpt_hour', 'asset x hour: product, order, total and good parts, running minutes, speed'],
  ['event', 'rpt_event', 'one stop or planned activity: time, asset, reason path, group, minutes, comment text'],
  ['counter', 'rpt_counter (later)', 'asset x window x counter: reject count. After test 4 and a time series address in Config'],
];

// Bands of the flow strip: table key, sources that feed it (SOURCES keys).
const BANDS = [
  ['window', ['line', 'machine', 'segments']],
  ['hour', ['line', 'order']],
  ['event', ['stops', 'machine', 'comments']],
  ['counter', ['counters']],
];

// Matrix: which table each report block reads. 'reckitt' = a file joined in
// Tableau, not a table. A block with no entry has no data at all.
const USES = {
  header: ['window'],
  how: ['window'],
  bottles: ['window'],
  hourly: ['hour', 'window'],
  machines: ['window'],
  ran: ['hour', 'event', 'reckitt'],
  planned: ['event', 'reckitt'],
  wrote: ['event'],
  measured: [],
  stopped: ['window', 'event'],
  threw: ['window', 'counter', 'reckitt'],
};

// Block: key, title, level of the block as a whole, items [text, level, source].
const BLOCKS = [
  ['header', 'Header', 'have', [
    ['Line, date, production day window', 'have', 'Config tab'],
    ['Times in local time (BST)', 'have', 'conversion in the flow or in Tableau'],
  ]],
  ['how', 'How the line did', 'have', [
    ['OEE, availability, performance, quality', 'have', 'evaluateKPIs, line'],
    ['Stop hours in planned time', 'have', 'Availability losses, Operational time'],
    ['Short stops time', 'have', 'Micro stops (duration)'],
    ['Time under target, no stop booked', 'test', 'time segments + rule'],
    ['Rejected of total', 'have', 'Rejected parts, Total parts'],
    ['Old system OEE as a check', 'none', 'only a comparison, drops out'],
  ]],
  ['bottles', 'The day in bottles', 'have', [
    ['Line capacity in units', 'have', 'design speed x planned time'],
    ['Made and lost, units and share', 'have', 'loss KPIs x design speed'],
    ['Running rate against target', 'have', 'Total parts / Net production time'],
  ]],
  ['hourly', 'By hour and last 30 days', 'have', [
    ['Output per hour', 'have', 'hourly evaluateKPIs'],
    ['Running speed per hour', 'have', 'hourly parts / running minutes'],
    ['This day against the last 30', 'have', 'history of the daily files'],
  ]],
  ['machines', 'Machines', 'api', [
    ['A, Q, rate and speed per machine', 'api', 'evaluateKPIs per machine (tested)'],
    ['Counted and rejects per machine', 'api', 'KPIs per machine (tested)'],
    ['Down time and stops per machine', 'api', 'downtimeReasons per machine (tested)'],
  ]],
  ['ran', 'What ran', 'test', [
    ['Product of each block', 'have', 'product per hour'],
    ['Batch (order) of each block', 'have', 'order per hour, empty on days with no order'],
    ['Exact run blocks and changeovers', 'test', 'time segments or counter series'],
    ['Made in the window per batch', 'have', 'KPIs filtered on the order'],
    ['Made over the whole batch', 'api', 'same call, batch window'],
    ['Work order number', 'none', 'not seen in Insights Hub'],
    ['Batch target quantity', 'source', 'SAP'],
    ['Planned maintenance and cleans', 'test', 'planned reasons + reason list'],
  ]],
  ['planned', 'Planned work against target', 'source', [
    ['Booked time per activity', 'test', 'downtimeReasons, planned reasons'],
    ['Target per changeover or clean', 'source', 'target table from Reckitt'],
    ['Actual and difference in units', 'test', 'needs exact run blocks'],
  ]],
  ['wrote', 'What the operators wrote', 'have', [
    ['Time, reason, duration', 'have', 'downtimeReasons (pbi_daily_losses)'],
    ['Comment text', 'source', 'Provideam Mode Log, not Insights Hub'],
  ]],
  ['measured', 'What it measured (filler heads)', 'none', [
    ['Fill weight per head', 'none', 'not in the filler aspects seen'],
    ['Cap torque per head, flagged heads', 'none', 'not in the filler aspects seen'],
  ]],
  ['stopped', 'What stopped it, machine performance', 'api', [
    ['Good and reject per machine', 'api', 'KPIs per machine (tested)'],
    ['Worst own alarm per machine', 'api', 'reason text with alarm code (tested)'],
    ['Waiting on the line', 'api', 'category Lack of resources (tested)'],
    ['Operator stops: which reasons count', 'source', 'Reckitt confirms the rule; other categories exist'],
    ['Time per group: ran, faults, operator, waiting, planned, other', 'api', 'segment categories per machine (tested)'],
    ['Top 3 faults and waits', 'api', 'downtimeReasons per machine (tested)'],
  ]],
  ['threw', 'What it threw away', 'api', [
    ['Counted and rejects per machine', 'api', 'KPIs per machine (tested)'],
    ['Cost per reject', 'source', 'costing sheet'],
    ['Why the filler rejected', 'api', 'filler reject counters'],
    ['Why the cartoner rejected', 'none', 'cartoner has a reject flag, no reason variable'],
    ['Product dumped by a clean', 'none', 'no rule'],
  ]],
];

// ---- Writer -------------------------------------------------------------------
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bold = (s) => `<b>${esc(s)}</b>`;
const small = (s) => `<font style="font-size:9px" color="#555555">${esc(s)}</font>`;

// Height that fits the text (same estimate as scripts/validate-drawio.js).
function fit(width, parts) {
  const usable = width - 16;
  let lines = 0;
  for (const p of parts) {
    lines += Math.max(1, Math.ceil((p.length * 6.1) / usable));
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
    return `s${this.index}c${this.n}`;
  }

  box(x, y, w, h, html, level, extra = '') {
    const { fill, stroke } = LEVEL[level];
    const id = this.id();
    let style = 'rounded=1;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;';
    style += 'spacingLeft=8;spacingRight=6;fontSize=11;arcSize=8;';
    style += `fillColor=${fill};strokeColor=${stroke};${extra}`;
    this.cells.push(
      `<mxCell id="${id}" value="${esc(html)}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );
    return id;
  }

  text(x, y, w, h, html) {
    const id = this.id();
    const style = 'text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontSize=12;';
    this.cells.push(
      `<mxCell id="${id}" value="${esc(html)}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );
    return id;
  }

  edge(source, target, color, dashed = false) {
    const id = this.id();
    let style = 'edgeStyle=orthogonalEdgeStyle;html=1;endArrow=block;endFill=1;';
    style += `strokeWidth=1.5;strokeColor=${color};${dashed ? 'dashed=1;' : ''}`;
    this.cells.push(
      `<mxCell id="${id}" style="${style}" edge="1" parent="1" source="${source}" target="${target}">` +
        '<mxGeometry relative="1" as="geometry"/></mxCell>',
    );
  }

  xml() {
    let head = `<diagram name="${esc(this.name)}" id="page${this.index}">`;
    head += '<mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" ';
    head += 'connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">';
    head += '<root><mxCell id="0"/><mxCell id="1" parent="0"/>';
    return `${head}${this.cells.join('')}</root></mxGraphModel></diagram>`;
  }
}

function legend(page, x, y) {
  let top = y;
  for (const key of ['have', 'api', 'test', 'source', 'none']) {
    page.box(x, top, 200, 30, bold(LEVEL[key].label), key);
    top += 40;
  }
  return top;
}

// ---- Page 1: overview ------------------------------------------------------------
const overview = new Page('Overview', 0);
let title = bold('Shift (management) report: where the data comes from');
title += `<br>${small('Top: which Insights Hub calls fill which of 3 proposed tables (not built). Bottom: which table each report block reads. Colour of a box = availability.')}`;
title += `<br>${small('Every table holds all lines of a site, one file per site and day (rpt_*/site=Hull/..._YYYY-MM-DD.parquet). Tableau filters by line.')}`;
overview.text(40, 20, 1100, 70, title);
legend(overview, 1220, 20);

const SRC_W = 300;
const TBL_X = 440;
const TBL_W = 380;
const byKey = (list) => Object.fromEntries(list.map((r) => [r[0], r]));
const srcByKey = byKey(SOURCES);
const tblByKey = byKey(TABLES);
const tableIds = {};
let y = 120;
overview.text(40, y - 30, SRC_W, 24, bold('Insights Hub calls (sources)'));
overview.text(TBL_X, y - 30, TBL_W, 24, bold('Proposed tables'));
for (const [tkey, srcs] of BANDS) {
  const [, tname, tdetail] = tblByKey[tkey];
  let sy = y;
  const srcIds = [];
  for (const k of srcs) {
    const [, level, name, detail] = srcByKey[k];
    const h = fit(SRC_W, [name, detail]);
    srcIds.push(overview.box(40, sy, SRC_W, h, `${bold(name)}<br>${small(detail)}`, level));
    sy += h + 10;
  }
  const bandH = sy - y - 10;
  const th = Math.min(bandH, fit(TBL_W, [tname, tdetail]));
  const ty = y + Math.floor((bandH - th) / 2);
  tableIds[tkey] = overview.box(TBL_X, ty, TBL_W, th, `${bold(tname)}<br>${small(tdetail)}`, 'table');
  for (const sid of srcIds) {
    overview.edge(sid, tableIds[tkey], '#555555', tkey === 'counter');
  }
  y = sy + 20;
}
// Reckitt files are not a table: they are joined in Tableau.
{
  const [, level, name, detail] = srcByKey.reckitt;
  const h = fit(SRC_W, [name, detail]);
  const a = overview.box(40, y, SRC_W, h, `${bold(name)}<br>${small(detail)}`, level);
  const note = 'Not a table: files from Reckitt, joined in Tableau by line, product or reason';
  const hb = fit(TBL_W, [note]);
  const b = overview.box(TBL_X, y, TBL_W, Math.max(h, hb), small(note), 'source');
  overview.edge(a, b, '#6c8ebf', true);
  y += Math.max(h, hb) + 50;
}

// Matrix: one row per report block, one column per table.
const MX_LABEL_W = 300;
const MX_COL_W = 150;
const COLS = [
  ['window', 'rpt_window'],
  ['hour', 'rpt_hour'],
  ['event', 'rpt_event'],
  ['counter', 'rpt_counter (later)'],
  ['reckitt', 'Reckitt files'],
];
overview.text(40, y, 700, 24, bold('Report blocks and the table each one reads'));
y += 34;
COLS.forEach(([, label], i) => {
  overview.box(40 + MX_LABEL_W + 10 + i * (MX_COL_W + 10), y, MX_COL_W, 30, bold(label), 'table');
});
y += 40;
for (const [key, name, level] of BLOCKS) {
  const uses = USES[key] || [];
  overview.box(40, y, MX_LABEL_W, 30, bold(name), level);
  COLS.forEach(([ckey], i) => {
    const x = 40 + MX_LABEL_W + 10 + i * (MX_COL_W + 10);
    if (uses.includes(ckey)) {
      overview.box(x, y, MX_COL_W, 30, bold('reads'), ckey === 'reckitt' ? 'source' : 'neutral');
    }
  });
  if (!uses.length) {
    overview.text(40 + MX_LABEL_W + 10, y, 5 * MX_COL_W, 30, small('no data source known (see page Not available)'));
  }
  y += 40;
}

// ---- Page 2: every item ------------------------------------------------------------
const items = new Page('Items per block', 1);
let head = bold('Every item of the report and its availability');
head += `<br>${small('One row per report block. Small text = where it comes from in Insights Hub.')}`;
items.text(40, 20, 1100, 50, head);
legend(items, 1500, 20);
const ITEM_W = 260;
const PER_ROW = 4;
y = 100;
for (const [, name, level, list] of BLOCKS) {
  let rowTop = y;
  for (let start = 0; start < list.length; start += PER_ROW) {
    const row = list.slice(start, start + PER_ROW);
    const h = Math.max(...row.map(([t, , s]) => fit(ITEM_W, [t, s])));
    row.forEach(([t, lv, s], i) => {
      items.box(300 + i * (ITEM_W + 20), rowTop, ITEM_W, h, `${bold(t)}<br>${small(s)}`, lv);
    });
    rowTop += h + 10;
  }
  const blockH = rowTop - y - 10;
  items.box(40, y, 220, Math.max(blockH, fit(220, [name])), bold(name), level, 'strokeWidth=3;');
  y = rowTop + 20;
}

// ---- Page 3: not available -------------------------------------------------------------
const missing = new Page('Not available', 2);
let mHead = bold('Not available in Insights Hub: to raise with Reckitt');
mHead += `<br>${small('Built from page 2: every red and blue item. Red: no source known. Blue: a file or a rule from Reckitt would close it.')}`;
missing.text(40, 20, 900, 50, mHead);
y = 100;
// Built from page 2: every red (none) and blue (source) item, with its block.
for (const [, blockName, , list] of BLOCKS) {
  for (const [name, lv, detail] of list) {
    if (lv !== 'none' && lv !== 'source') {
      continue;
    }
    const h = fit(700, [name, `${blockName}: ${detail}`]);
    missing.box(40, y, 700, h, `${bold(name)}<br>${small(`${blockName}: ${detail}`)}`, lv);
    y += h + 15;
  }
}

// ---- Write -----------------------------------------------------------------------------
const pages = [overview, items, missing];
let out = '<mxfile host="build-drawio-shift-report.js" type="device">';
out += pages.map((p) => p.xml()).join('');
out += '</mxfile>\n';
mkdirSync('diagrams', { recursive: true });
writeFileSync(OUTPUT, out);
console.log(`Wrote ${OUTPUT}: ${pages.length} pages`);
