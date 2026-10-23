// Builds diagrams/segun-report-tables.drawio: PLAN for report-shaped tables
// (one small table per report section) instead of the three rpt_* tables.
// Page 1: report sections -> proposed tables. Page 2: every table, its
// columns, an example value from the B2 report of 2026-09-14, and where the
// value comes from (current rpt_* column or a rule), coloured by status.
// Page 3: conventions and open decisions.
// Usage: node scripts/build-drawio-segun-tables.js
import { writeFileSync } from 'node:fs';

const OUTPUT = 'diagrams/segun-report-tables.drawio';

// ---- Levels and colours (same as the shift report data map) ----------------
const LEVEL = {
  have: { fill: '#d5e8d4', stroke: '#82b366', label: 'HAVE NOW' },
  api: { fill: '#fff2cc', stroke: '#d6b656', label: 'IN THE API, NEW FLOW' },
  test: { fill: '#ffe6cc', stroke: '#d79b00', label: 'TEST / RULE FIRST' },
  source: { fill: '#dae8fc', stroke: '#6c8ebf', label: 'NEW SOURCE (RECKITT)' },
  none: { fill: '#f8cecc', stroke: '#b85450', label: 'NO SOURCE KNOWN' },
  table: { fill: '#f5f5f5', stroke: '#666666', label: '' },
  head: { fill: '#dddddd', stroke: '#666666', label: '' },
};

// ---- Report sections: id, page, title, level ---------------------------------
const SECTIONS = [
  ['header', 1, 'Header: line, date, window', 'have'],
  ['how', 1, 'How the line did (OEE, A, P, Q)', 'have'],
  ['vs', 1, '"vs" figures, "our model 42%" (Provideam)', 'none'],
  ['under', 1, '1h 29m under target, no stop booked', 'test'],
  ['picture', 1, 'The day in one picture (OEE % and CU bars)', 'have'],
  ['bottles', 1, 'The day in bottles', 'have'],
  ['hourly', 1, 'Output by hour', 'have'],
  ['speed', 2, 'Running speed by hour', 'have'],
  ['last30', 2, 'This day against the last 30', 'have'],
  ['machines', 2, 'Machines table', 'api'],
  ['order', 2, 'The day in order (run blocks)', 'test'],
  ['batches', 2, 'Batches in this shift', 'test'],
  ['maint', 2, 'Planned maintenance', 'test'],
  ['plannedwork', 3, 'Planned work against its target', 'source'],
  ['wrote', 3, 'What the operators wrote', 'have'],
  ['measured', 4, 'What it measured (per head)', 'none'],
  ['bymachine', 4, 'By machine: counters and worst alarm', 'api'],
  ['waiting', 4, 'Waiting on the line', 'api'],
  ['perf', 5, 'Machine performance (stacked bars, top 3)', 'api'],
  ['depal', 5, 'Depalletiser / Palletiser fault text', 'none'],
  ['operator', 5, 'Operator and planned minutes', 'test'],
  ['rejects', 6, 'Rejects and what they cost', 'source'],
  ['whyfiller', 6, 'Why the Filler rejected', 'test'],
  ['whycart', 6, 'Why the Cartoner rejected', 'none'],
  ['dumped', 6, 'Product dumped', 'none'],
];

// Which table each section reads. 'drop' = not kept, 'notable' = no table
// until a rule or source exists.
const USES = {
  header: ['summary'],
  how: ['kpi', 'summary'],
  vs: ['drop'],
  under: ['summary', 'capacity'],
  picture: ['capacity'],
  bottles: ['capacity', 'summary'],
  hourly: ['hour'],
  speed: ['hour', 'summary'],
  last30: ['summary'],
  machines: ['machine'],
  order: ['runblock'],
  batches: ['batch'],
  maint: ['planned'],
  plannedwork: ['planned'],
  wrote: ['comment'],
  measured: ['head'],
  bymachine: ['machine'],
  waiting: ['reason'],
  perf: ['machinetime', 'reason'],
  depal: ['machine'],
  operator: ['machinetime'],
  rejects: ['machine'],
  whyfiller: ['rejectreason'],
  whycart: ['rejectreason'],
  dumped: ['notable'],
};

// ---- Tables ------------------------------------------------------------------
// Every table starts with the same three keys (one slicer for all visuals).
const KEYS = [
  'line, production_day, window',
  'B2 Line | 2026-09-14 | day',
  'rpt_*: line_name, production_day, window_name (day or crew)',
  'have',
];

// key, name, grain and rows, columns [name, example, from, level].
const TABLES = [
  ['summary', 'shift_summary',
    '1 row per line x window. Header, KPI side numbers, capacity line, '
    + 'last 30 days (filter production_day on the 30 days before)', [
      KEYS,
      ['window_start_local', '2026-09-14 06:00', 'rpt_window.window_start + Config time zone', 'have'],
      ['window_end_local', '2026-09-15 06:00', 'rpt_window.window_end + Config time zone', 'have'],
      ['time_zone', 'BST', 'Config TIME_ZONES', 'have'],
      ['generated_local', '15 Sep 06:00', 'rpt_window.loaded_at + time zone', 'have'],
      ['planned_min, planned_text', '1440 | 24h 00m', 'rpt_window.operational_min', 'have'],
      ['stop_min, stop_text', '223 | 3h 43m', 'rpt_window.availability_loss_min', 'have'],
      ['short_stop_min, short_stop_text', '524 | 8h 44m', 'rpt_window.micro_stop_min', 'have'],
      ['under_target_min, under_target_text', '89 | 1h 29m', 'rule: performance_loss_min minus micro_stop_min', 'test'],
      ['total_parts', '114,771', 'rpt_window.total_parts', 'have'],
      ['good_parts', '114,313', 'rpt_window.good_parts', 'have'],
      ['rejected_parts', '458', 'rpt_window.rejected_parts', 'have'],
      ['capacity_cu', '273,586', 'rpt_window.capacity_units (empty without a product)', 'have'],
      ['target_rate_per_min', '190.0', 'rpt_window.design_speed_per_min; equal to the SAP routing target?', 'test'],
      ['running_min, running_text', '548 | 9h 08m', 'report uses Filler ran time; line net_production_min is 1225. Rule to pick', 'test'],
      ['running_rate_per_min', '212', 'total_parts / running_min', 'test'],
      ['oee_vs_capacity_pct', '42', 'good_parts / capacity_cu x 100 (30 days need backfilled days)', 'have'],
    ]],
  ['kpi', 'shift_kpi',
    'LONG: 4 rows per line x window (OEE, Availability, Performance, Quality). '
    + 'Rings and bars of "How the line did"', [
      KEYS,
      ['kpi', 'Availability', 'fixed: OEE, Availability, Performance, Quality', 'have'],
      ['kpi_order', '2', 'fixed 1 to 4', 'have'],
      ['value_pct', '85', 'rpt_window.oee, availability, performance, quality x 100 (OEE and P empty without a product)', 'have'],
      ['detail_text', '3h 43m of stoppages in 24h 00m planned', 'built from shift_summary columns', 'have'],
      ['detail_text (Performance)', '8h 44m short stops + 1h 29m under target', 'needs under_target_min', 'test'],
      ['vs_provideam_pct', 'MISSING (dropped)', 'Provideam figure, no source, not needed', 'none'],
    ]],
  ['capacity', 'shift_capacity',
    'LONG: 4 rows + 2 sub rows per line x window. Rows: Made | Lost to downtime | '
    + 'Lost to short stops and unaccounted time (sub: short stops booked, unaccounted) | Lost to rejects. '
    + 'Feeds both bars of "The day in one picture" and the table of "The day in bottles"', [
      KEYS,
      ['category', 'Lost to downtime', 'fixed row names (bottles table)', 'have'],
      ['label_kpi', 'Availability loss', 'fixed row names (OEE % bar)', 'have'],
      ['category_order', '2', 'fixed 1 to 4 (sub rows 3.1, 3.2)', 'have'],
      ['parent', '(empty) | Lost to short stops...', 'set on the 2 sub rows only', 'have'],
      ['cu', '42,355', 'capacity_units minus losses; *_loss_units of rpt_window', 'have'],
      ['share_pct', '15.5', 'cu / capacity_cu x 100', 'have'],
      ['sub row: short stops booked', '99,533', 'micro_stop_min x target rate', 'have'],
      ['sub row: unaccounted', '16,928', 'under_target_min x target rate', 'test'],
    ]],
  ['hour', 'shift_hour',
    '24 rows per line x day, LINE ONLY (machine hours stay in rpt_hour). '
    + 'Output by hour, Running speed by hour', [
      KEYS,
      ['hour_local', '06:00', 'rpt_hour.local_time (line rows)', 'have'],
      ['local_date', '2026-09-14', 'rpt_hour.local_date', 'have'],
      ['hour_order', '1', '1 to 24 in the production day', 'have'],
      ['shift_name', 'Gold', 'rpt_hour.shift_name', 'have'],
      ['bottles', '9,732', 'rpt_hour.total_parts', 'have'],
      ['running_min', '45', 'rpt_hour.net_production_min', 'have'],
      ['speed_per_min', '218', 'rpt_hour.speed_per_min (empty when it did not run)', 'have'],
      ['target_rate_per_min', '190', 'rpt_hour.design_speed_per_min (SAP equality to check)', 'test'],
    ]],
  ['machine', 'shift_machine',
    '1 row per machine x window (6 shown). Machines table, By machine: counters '
    + 'and worst alarm, Rejects and what they cost', [
      KEYS,
      ['machine', 'Filler', 'rpt_window.asset_name "02 Filler"; report name and which machines show (05 Antares not shown): Config', 'test'],
      ['machine_order', '2', 'number at the start of the asset name', 'have'],
      ['avail_pct', '41', 'rpt_window.availability x 100; operational time is 24 h on every machine: check planned time', 'test'],
      ['quality_pct', '99.5', 'rpt_window.quality x 100', 'have'],
      ['rate_per_min', '212', 'rpt_window.running_rate', 'have'],
      ['target_per_min', '190', 'per machine target (Case Packer 32 cases/min): source not tested', 'test'],
      ['speed_pct', '112', 'rate_per_min / target_per_min x 100', 'test'],
      ['counted', '115,747', 'rpt_window.total_parts', 'have'],
      ['counted_unit', 'bottles | cases', 'per machine setting (Case Packer = cases)', 'test'],
      ['has_counter', 'false (Depal., Pallet.)', 'report shows dashes; IH has counts. Decide', 'test'],
      ['good', '115,747', 'rpt_window.good_parts', 'have'],
      ['rejects', '540', 'rpt_window.rejected_parts', 'have'],
      ['reject_rate_pct', '0.46', 'rejects / counted x 100', 'have'],
      ['down_min, down_text', '76 | 1h 16m', 'rpt_window.downtime_min', 'have'],
      ['stops', '85', 'rpt_window.downtime_count', 'have'],
      ['worst_alarm', '222 Fallen bottles before fingers area', 'rpt_event: own fault (Unplanned Downtime) with most minutes', 'have'],
      ['worst_alarm (Depal., Pallet.)', 'MISSING', 'IH gives only "Other"; alarm text has no source', 'none'],
      ['worst_alarm_min, _text, _count', '73 | 1h 13m | 56', 'rpt_event: sum of minutes, occurrence', 'have'],
      ['reject_loses', 'MISSING (whole bottle)', 'costing sheet', 'source'],
      ['reject_cost_gbp', 'MISSING (129.60)', 'rejects x cost per unit, costing sheet', 'source'],
    ]],
  ['machinetime', 'shift_machine_time',
    'LONG: 6 rows per machine x window (Ran, Faults, Operator, Waiting, Planned, '
    + 'Other). Stacked bar and the "ran 9h 08m 38%" line of Machine performance', [
      KEYS,
      ['machine, machine_order', 'Filler | 2', 'as shift_machine', 'have'],
      ['category', 'Waiting', 'fixed: Ran, Faults, Operator, Waiting, Planned, Other', 'have'],
      ['category_order', '4', 'fixed 1 to 6 (also the colour order)', 'have'],
      ['minutes', '732', 'rpt_window.ran_min, fault_min, waiting_min, other_min', 'have'],
      ['minutes (Operator row)', 'MISSING (13)', 'rpt_window.operator_min: no rule, reason grouping from Reckitt', 'test'],
      ['minutes (Planned row)', '109', 'rpt_window.planned_min: not verified per machine', 'test'],
      ['time_text', '12h 12m', 'from minutes', 'have'],
      ['share_pct', '51', 'minutes / window minutes x 100', 'have'],
    ]],
  ['reason', 'shift_reason',
    '1 row per machine x window x reason (faults and waits). Top 3 of Machine '
    + 'performance (rank <= 3), Waiting on the line (kind = Waiting), "waited ... no bottles 32m" (sum by waiting_on)', [
      KEYS,
      ['machine, machine_order', 'Filler | 2', 'as shift_machine', 'have'],
      ['kind', 'Waiting', 'rpt_event.reason_path top: Unplanned Downtime = Faults, Lack of resources = Waiting', 'have'],
      ['waiting_on', 'outfeed blocked', 'reason_path under Lack of resources; mapping per reason to agree', 'test'],
      ['reason', '194 MAX OUTFEED ACCUMULATION', 'rpt_event.reason', 'have'],
      ['minutes, time_text', '671 | 11h 11m', 'sum of rpt_event.minutes', 'have'],
      ['stops', '203', 'sum of rpt_event.occurrence', 'have'],
      ['rank_in_machine', '1', 'rank by minutes per machine and kind', 'have'],
      ['in_planned_min', 'MISSING (3h 55m in total)', 'overlap with planned bookings; needs the planned-reason list', 'test'],
    ]],
  ['runblock', 'shift_run_block',
    '1 row per block of the day (Ran, Changeover, Clean). The day in order', [
      KEYS,
      ['block_order', '1', 'order in the day', 'test'],
      ['start_local, end_local', '06:00 | 06:00', 'timeModelCategoryDistribution segments; rule last good to first good bottle', 'test'],
      ['activity', 'Ran', 'Ran, Changeover, Clean', 'test'],
      ['batch', 'AJR694', 'rpt_hour.batch_id over the block', 'test'],
      ['took_min, took_text', '1440 | 24h 00m', 'end minus start', 'test'],
    ]],
  ['batch', 'shift_batch',
    '1 row per batch touching the window. Batches in this shift', [
      KEYS,
      ['batch', 'AJR694', 'rpt_hour.batch_id (machines 05, 07; empty on days without orders)', 'test'],
      ['work_order', 'MISSING (13379251)', 'no source in IH', 'source'],
      ['product', 'NURFN NFC STRW 6 x 100ML GB', 'rpt_hour.part_name', 'have'],
      ['made_whole_batch', '116,751', 'KPI call over the whole batch window (exists, not built)', 'test'],
      ['target', 'MISSING (180,000)', 'SAP order quantity', 'source'],
      ['in_shift_min, in_shift_text', '1440 | 24h 00m', 'sum of the run blocks of the batch', 'test'],
    ]],
  ['planned', 'shift_planned_work',
    '1 row per planned booking (clean, changeover, maintenance). Planned '
    + 'maintenance (filter type = maintenance), Planned work against its target', [
      KEYS,
      ['start_local, end_local', '10:29 | 10:57', 'rpt_event event_kind = planned (none seen yet)', 'test'],
      ['activity', 'Asset Care (2)', 'rpt_event.reason; list of planned reasons from Reckitt', 'test'],
      ['type', 'maintenance', 'clean, changeover, maintenance: reason grouping from Reckitt', 'source'],
      ['against_changeover', 'stood alone, no changeover followed', 'rule: match to run blocks', 'test'],
      ['booked_min, booked_text', '27 | 27m', 'sum of rpt_event.minutes', 'test'],
      ['target_min', 'MISSING', 'target table from Reckitt', 'source'],
      ['actual_min', 'MISSING', 'run blocks: last bottle out to first bottle in', 'test'],
      ['difference_min, difference_bottles', 'MISSING', 'actual minus target; x target rate', 'source'],
      ['comment', 'MISSING (antares pit stop)', 'Provideam Mode Log', 'source'],
    ]],
  ['comment', 'shift_comment',
    '1 row per booking with a comment. What the operators wrote', [
      KEYS,
      ['time_local', '06:00', 'rpt_event.local_time', 'have'],
      ['against', 'Daily Clean', 'rpt_event.reason (check the names exist in the IH reason tree)', 'have'],
      ['for_min, for_text', '70 | 1h 10m', 'rpt_event.minutes', 'have'],
      ['comment', 'MISSING (guard checks daily clean funcs)', 'Provideam Mode Log; 0 of 1,997 IH stops have one', 'source'],
    ]],
  ['head', 'shift_head_reading',
    '1 row per filler head. What it measured. Whole table has no source', [
      KEYS,
      ['head_type, head_no', 'MISSING (cap, 2)', 'no per-head data in IH', 'none'],
      ['mean, sd, readings', 'MISSING (160.16, 4.04, 11,309)', 'no per-head data in IH', 'none'],
      ['flagged_for', 'MISSING (dropping readings)', 'flag rule unknown', 'none'],
    ]],
  ['rejectreason', 'shift_reject_reason',
    '1 row per machine x reject reason. Why the Filler rejected, Why the Cartoner rejected', [
      KEYS,
      ['machine', 'Filler', 'as shift_machine', 'have'],
      ['reason, count (Filler)', 'bad cap | 243', 'counters Filler_Reject_BadCap, _Torque, _Weight, _NoInsert, _Insert: last minus first value', 'test'],
      ['reason, count (Cartoner)', 'MISSING (Product not inserted | 578)', '4 PLC counters, not in IH', 'none'],
      ['share_pct', '37.1', 'count / sum of the machine x 100', 'test'],
      ['machine_rejects', '540', 'shift_machine.rejects (shown beside, not reconciled)', 'have'],
    ]],
];

// ---- Drawing helpers (same as build-drawio-shift-report.js) -------------------
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
    return `t${this.index}c${this.n}`;
  }

  box(x, y, w, h, html, level, extra = '') {
    const { fill, stroke } = LEVEL[level];
    const id = this.id();
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
    const style = 'text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontSize=12;';
    this.cells.push(
      `<mxCell id="${id}" value="${esc(html)}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );
    return id;
  }

  edge(source, target, color) {
    const id = this.id();
    let style = 'edgeStyle=entityRelationEdgeStyle;html=1;endArrow=block;endFill=1;';
    style += `strokeWidth=1;strokeColor=${color};`;
    this.cells.push(
      `<mxCell id="${id}" style="${style}" edge="1" parent="1" source="${source}" target="${target}">` +
        '<mxGeometry relative="1" as="geometry"/></mxCell>',
    );
  }

  xml() {
    let head = `<diagram name="${esc(this.name)}" id="segun${this.index}">`;
    head += '<mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" ';
    head += 'connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">';
    head += '<root><mxCell id="0"/><mxCell id="1" parent="0"/>';
    return `${head}${this.cells.join('')}</root></mxGraphModel></diagram>`;
  }
}

function legend(page, x, y) {
  let top = y;
  for (const key of ['have', 'api', 'test', 'source', 'none']) {
    page.box(x, top, 220, 30, bold(LEVEL[key].label), key);
    top += 40;
  }
  return top;
}

const tableName = Object.fromEntries(TABLES.map((t) => [t[0], t[1]]));
tableName.drop = 'not kept (cross-check only)';
tableName.notable = 'no table until Reckitt gives a rule';

// ---- Page 1: sections -> tables ----------------------------------------------
const p1 = new Page('Sections to tables', 1);
p1.text(40, 20, 1100, 50,
  `${bold('PLAN: one small table per report section, named like the report')}<br>`
  + small('B2 shift report 2026-09-14. Left: report sections (page, title), coloured by data status. '
  + 'Right: proposed tables. Columns and examples on page 2.'));
const tableIds = {};
const tableKeys = [...TABLES.map((t) => t[0]), 'drop', 'notable'];
let ty = 90;
for (const key of tableKeys) {
  const t = TABLES.find((x) => x[0] === key);
  const level = key === 'drop' || key === 'notable' ? 'none' : 'table';
  const sub = t ? `${t[3].length} columns` : '';
  const h = fit(320, [tableName[key], sub]);
  tableIds[key] = p1.box(820, ty, 320, h, `${bold(tableName[key])}<br>${small(sub)}`, level);
  ty += h + 30;
}
let sy = 90;
for (const [id, page, title, level] of SECTIONS) {
  const html = `${small(`p${page}`)} ${bold(title)}<br>${small(LEVEL[level].label)}`;
  const h = fit(380, [`p${page} ${title}`, LEVEL[level].label]);
  const box = p1.box(40, sy, 380, h, html, level);
  for (const t of USES[id]) {
    p1.edge(box, tableIds[t], LEVEL[level].stroke);
  }
  sy += h + 12;
}
legend(p1, 1200, 90);

// ---- Page 2: table cards -------------------------------------------------------
const p2 = new Page('Tables and columns', 2);
p2.text(40, 20, 1900, 50,
  `${bold('Proposed tables: column | example from the B2 report 2026-09-14 | where it comes from')}<br>`
  + small('Colour = status of that column. MISSING (value) = the report shows a value but we have no source: '
  + 'the dummy data will say MISSING, the value in brackets is only what the PDF shows.'));
const W = [210, 190, 300];
const CARD = W[0] + W[1] + W[2];
const colY = [90, 90, 90];
for (const [, name, grain, cols] of TABLES) {
  const c = colY.indexOf(Math.min(...colY));
  const x = 40 + c * (CARD + 50);
  let y = colY[c];
  const hh = fit(CARD, [name, grain]);
  p2.box(x, y, CARD, hh, `${bold(name)}<br>${small(grain)}`, 'head');
  y += hh;
  p2.box(x, y, W[0], 30, bold('column'), 'table');
  p2.box(x + W[0], y, W[1], 30, bold('example'), 'table');
  p2.box(x + W[0] + W[1], y, W[2], 30, bold('from'), 'table');
  y += 30;
  for (const [col, ex, from, level] of cols) {
    const h = Math.max(fit(W[0], [col]), fit(W[1], [ex]), fit(W[2], [from]));
    p2.box(x, y, W[0], h, bold(col), level);
    p2.box(x + W[0], y, W[1], h, esc(ex), level);
    p2.box(x + W[0] + W[1], y, W[2], h, small(from), level);
    y += h;
  }
  colY[c] = y + 50;
}
legend(p2, 40 + 3 * (CARD + 50), 90);

// ---- Page 3: conventions and open decisions -------------------------------------
const p3 = new Page('Conventions and decisions', 3);
const RULES = [
  ['Naming', 'Table names start with shift_ and follow the report section. Column names use the words on the report '
    + '(machine, rejects, stops, worst_alarm), not the Insights Hub KPI names.'],
  ['Keys', 'Every table starts with line, production_day, window (day or crew name). One slicer filters every visual.'],
  ['Times', 'Local time only, as text HH:MM (_local). No UTC, no ids, no loaded_at in these tables: they stay in rpt_*.'],
  ['Numbers', 'Percent as 0 to 100 (_pct). Durations twice: _min (number, to sum) and _text ("3h 43m", to show). '
    + 'Counts whole numbers. CU = bottles at the target rate.'],
  ['Long tables', 'Where the report shows a bar of parts or a ring per KPI (shift_kpi, shift_capacity, shift_machine_time) '
    + 'the table is unpivoted: one row per part, with a label as on the report and an _order column for sorting and colour.'],
  ['Missing', 'A column the report needs but we cannot fill stays in the table, empty, and is marked here. '
    + 'Nothing is invented. Provideam "vs" numbers are dropped (cross-check only).'],
  ['rpt_* stays', 'rpt_window, rpt_hour, rpt_event stay as the detail source in the lake. '
    + 'The shift_* tables are built from them (plus later sources) and are all Segun reads.'],
];
const OPEN = [
  'Where to build shift_*: (a) a new VFC step after the shift report flow reads rpt_* and writes shift_* parquet, '
    + '(b) a Tableau / Power BI prep step. Recommendation: (a), so the logic lives in one place.',
  'Report per day, per shift, or both? The window key allows both; the PDF covers the whole day.',
  'Report name and order of each machine, and whether 05 Antares shows (Config).',
  'Running time for the running rate: line net production time or the Filler run time (the PDF uses 9h 08m).',
  'Next step after this plan is approved: dummy data, one sheet per table, values from the PDF, MISSING where no source.',
];
let y3 = 20;
p3.text(40, y3, 1000, 30, bold('Conventions'));
y3 += 40;
for (const [k, v] of RULES) {
  const h = fit(860, [v]);
  p3.box(40, y3, 180, h, bold(k), 'table');
  p3.box(220, y3, 860, h, esc(v), 'table');
  y3 += h;
}
y3 += 30;
p3.text(40, y3, 1000, 30, bold('Open decisions'));
y3 += 40;
for (const v of OPEN) {
  const h = fit(1040, [v]);
  p3.box(40, y3, 1040, h, esc(v), 'test');
  y3 += h + 10;
}

const xml = '<mxfile host="build-drawio-segun-tables.js">'
  + [p1, p2, p3].map((p) => p.xml()).join('') + '</mxfile>';
writeFileSync(OUTPUT, xml);
console.log(`Wrote ${OUTPUT}`);
