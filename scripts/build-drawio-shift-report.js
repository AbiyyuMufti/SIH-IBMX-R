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
  ['machine', 'test', 'Machine KPIs and stops', '7 machine assets: evaluateKPIs, downtimeReasons'],
  ['segments', 'test', 'Time segments', 'statusDistribution, timeModelCategoryDistribution'],
  ['counters', 'api', 'Reject counters', 'time series of the filler (cartoner to check)'],
  ['comments', 'test', 'Comment text', 'comment read per stop (never tested)'],
  ['reckitt', 'source', 'Reckitt files', 'SAP order quantity, costs, changeover and clean targets'],
];

const TABLES = [
  ['line_window', 'rpt_line_window', 'line x window: OEE, A, P, Q, parts, capacity, losses in units'],
  ['line_hour', 'rpt_line_hour', 'line x hour: product, order, parts, running minutes, speed'],
  ['machine_window', 'rpt_machine_window', 'machine x window: A, Q, counted, rejects, down, stops, time per group'],
  ['machine_reason', 'rpt_machine_reason', 'machine x window x reason: group, minutes, count, rank'],
  ['booking', 'rpt_booking', 'one booked stop or activity: time, machine, reason, minutes, comment'],
  ['batch', 'rpt_batch', 'order x window: product, minutes, made in window, made over the batch'],
  ['reject_counter', 'rpt_reject_counter', 'machine x window x counter: count'],
];

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
  ['machines', 'Machines', 'test', [
    ['A, Q, rate and speed per machine', 'test', 'evaluateKPIs per machine'],
    ['Counted and rejects per machine', 'test', 'KPIs per machine'],
    ['Down time and stops per machine', 'test', 'downtimeReasons per machine'],
  ]],
  ['ran', 'What ran', 'test', [
    ['Batch and product of each block', 'have', 'order and product per hour'],
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
  ['wrote', 'What the operators wrote', 'test', [
    ['Time, reason, duration', 'have', 'downtimeReasons (pbi_daily_losses)'],
    ['Comment text', 'test', 'only the count read so far'],
  ]],
  ['measured', 'What it measured (filler heads)', 'none', [
    ['Fill weight per head', 'none', 'not in the filler aspects seen'],
    ['Cap torque per head, flagged heads', 'none', 'not in the filler aspects seen'],
  ]],
  ['stopped', 'What stopped it, machine performance', 'test', [
    ['Good and reject per machine', 'test', 'KPIs per machine'],
    ['Worst own alarm per machine', 'test', 'downtimeReasons per machine'],
    ['Waiting on the line', 'test', 'reasons per machine + grouping'],
    ['Time per group: ran, faults, operator, waiting, planned, other', 'test', 'segments per machine + mapping'],
    ['Top 3 faults and waits', 'test', 'downtimeReasons per machine'],
  ]],
  ['threw', 'What it threw away', 'test', [
    ['Counted and rejects per machine', 'test', 'KPIs per machine'],
    ['Cost per reject', 'source', 'costing sheet'],
    ['Why the filler rejected', 'api', 'filler reject counters'],
    ['Why the cartoner rejected', 'test', 'cartoner aspects, to list'],
    ['Product dumped by a clean', 'none', 'no rule'],
  ]],
];

// Wires: source -> table, table -> block, source -> block (direct).
const SOURCE_TO_TABLE = [
  ['line', 'line_window'], ['line', 'line_hour'], ['order', 'line_hour'],
  ['order', 'batch'], ['stops', 'booking'], ['stops', 'line_window'],
  ['machine', 'machine_window'], ['machine', 'machine_reason'],
  ['segments', 'machine_window'], ['segments', 'line_window'],
  ['counters', 'reject_counter'], ['comments', 'booking'],
];
const TABLE_TO_BLOCK = [
  ['line_window', 'header'], ['line_window', 'how'], ['line_window', 'bottles'],
  ['line_hour', 'hourly'], ['machine_window', 'machines'],
  ['machine_window', 'stopped'], ['machine_reason', 'stopped'],
  ['machine_window', 'threw'], ['booking', 'ran'], ['booking', 'planned'],
  ['booking', 'wrote'], ['batch', 'ran'], ['reject_counter', 'threw'],
];
const SOURCE_TO_BLOCK = [
  ['history', 'hourly'], ['reckitt', 'ran'], ['reckitt', 'planned'], ['reckitt', 'threw'],
];

const NOT_AVAILABLE = [
  ['none', 'Fill weight and cap torque per head', 'unless the aspect types show variables we did not see'],
  ['source', 'Cost per reject', 'costing sheet from Reckitt'],
  ['source', 'Batch target quantity', 'SAP'],
  ['none', 'Work order number', 'ask where it comes from'],
  ['source', 'Targets for changeovers and cleans', 'target table from Reckitt'],
  ['none', 'Product dumped by a clean', 'the rule, from Reckitt'],
  ['none', 'Old system OEE figure', 'only a cross-check, not needed later'],
  ['source', 'Reason groups', 'which reasons are cleans, maintenance, changeovers; faults, operator, waiting, planned'],
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
title += `<br>${small('Left: Insights Hub and Reckitt sources. Middle: proposed rpt_* tables (not built). Right: report blocks. Colour = availability.')}`;
overview.text(40, 20, 1100, 50, title);
legend(overview, 1220, 20);

const ids = {};
const COL_W = 300;
let y = 100;
overview.text(40, y - 30, COL_W, 24, bold('Sources'));
for (const [key, level, name, detail] of SOURCES) {
  const h = fit(COL_W, [name, detail]);
  ids[key] = overview.box(40, y, COL_W, h, `${bold(name)}<br>${small(detail)}`, level);
  y += h + 20;
}
y = 100;
overview.text(440, y - 30, COL_W, 24, bold('Proposed tables (not built)'));
for (const [key, name, detail] of TABLES) {
  const h = fit(COL_W, [name, detail]);
  ids[key] = overview.box(440, y, COL_W, h, `${bold(name)}<br>${small(detail)}`, 'table');
  y += h + 30;
}
y = 100;
overview.text(840, y - 30, COL_W, 24, bold('Report blocks'));
for (const [key, name, level] of BLOCKS) {
  const label = LEVEL[level].label.toLowerCase();
  const h = fit(COL_W, [name, `mostly: ${label}`]);
  ids[key] = overview.box(840, y, COL_W, h, `${bold(name)}<br>${small(`mostly: ${label}`)}`, level);
  y += h + 20;
}
for (const [a, b] of SOURCE_TO_TABLE) {
  overview.edge(ids[a], ids[b], '#555555');
}
for (const [a, b] of TABLE_TO_BLOCK) {
  overview.edge(ids[a], ids[b], '#555555');
}
for (const [a, b] of SOURCE_TO_BLOCK) {
  overview.edge(ids[a], ids[b], a === 'reckitt' ? '#6c8ebf' : '#82b366', true);
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
mHead += `<br>${small('Red: no source known. Blue: a file or a rule from Reckitt would close it.')}`;
missing.text(40, 20, 900, 50, mHead);
y = 100;
for (const [lv, name, detail] of NOT_AVAILABLE) {
  const h = fit(700, [name, detail]);
  missing.box(40, y, 700, h, `${bold(name)}<br>${small(detail)}`, lv);
  y += h + 15;
}

// ---- Write -----------------------------------------------------------------------------
const pages = [overview, items, missing];
let out = '<mxfile host="build-drawio-shift-report.js" type="device">';
out += pages.map((p) => p.xml()).join('');
out += '</mxfile>\n';
mkdirSync('diagrams', { recursive: true });
writeFileSync(OUTPUT, out);
console.log(`Wrote ${OUTPUT}: ${pages.length} pages`);
