// Builds diagrams/site-dashboards-map.drawio: the site dashboards
// (Nottingham, Hull) against our EU-level tables, for the discussion with
// Segun and the team. Six new pages first, then every page of
// diagrams/powerbi-data-map.drawio copied unchanged (names prefixed), so the
// whole picture is in one file.
// Text source: prompt-response/site-dashboards-analysis.md
// Usage: node scripts/build-drawio-site-dashboards.js
import { readFileSync, writeFileSync } from 'node:fs';

const OUTPUT = 'diagrams/site-dashboards-map.drawio';
const REFERENCE = 'diagrams/powerbi-data-map.drawio';
const REFERENCE_PREFIX = 'PBI map: ';

// ---- Levels and colours (same family as the other data maps) ---------------
const LEVEL = {
  have: { fill: '#d5e8d4', stroke: '#82b366', label: 'OURS TODAY' },
  change: { fill: '#fff2cc', stroke: '#d6b656', label: 'OURS + SCOPE COLUMN (C1)' },
  table: { fill: '#ffe6cc', stroke: '#d79b00', label: 'NEW TABLE FROM FILES WE HOLD' },
  archive: { fill: '#e1d5e7', stroke: '#9673a6', label: 'ONE-TIME ARCHIVE' },
  source: { fill: '#dae8fc', stroke: '#6c8ebf', label: 'NEW FILE OR INPUT (RECKITT)' },
  none: { fill: '#f8cecc', stroke: '#b85450', label: 'NOT AVAILABLE' },
  neutral: { fill: '#ffffff', stroke: '#666666', label: '' },
  grey: { fill: '#f5f5f5', stroke: '#666666', label: '' },
};

// ---- Content: agreed pages (page 1) ------------------------------------------
// [EU page, Nottingham page, Hull page, common build, level, data needed]
const PAGES = [
  ['EU-Level Overview (done)', '-', '-', 'Retain EU overview', 'change', 'Filter In EU Report = true, then the same numbers as today'],
  ['Site-Level Overview (done)', 'Homepage', 'Homepage', 'Reuse, enhancements needed', 'change', 'All machines of the site. Same visuals as the EU page. Hull adds Availability / Performance gauges (D8)'],
  ['-', 'VSU Homepage', '-', 'Site overview with VSU filter', 'change', 'Only S14 (the EU drops S14)'],
  ['Planned Losses (done)', 'Planned Losses', 'Planned Losses', 'Reuse EU page', 'change', 'All machines; sub group slicer; Loss in CUs in the drill-down'],
  ['Unplanned Losses (done)', 'Unplanned Losses', 'Unplanned Losses', 'Reuse EU page', 'change', 'All machines; sub group slicer'],
  ['-', 'VSU Losses', '-', 'Unplanned Losses with VSU filter', 'change', 'Only S14'],
  ['-', '-', 'Unplanned Losses Daily Report', 'Reuse Unplanned Losses, daily detail', 'change', 'Stop drill-down with comment, date, Lvl 3 Loss Name'],
  ['Not built', 'L2/L3 FIT View', 'L2/L3 FIT View', 'Common build', 'change', 'Matrix machine x shift, last 24 h: OEE and 16 sub group loss %'],
  ['Not built', 'Loss Trending', 'Loss Trending', 'Common build', 'change', 'Loss % and MTTR by month, week, line; top losses drill'],
  ['Not built', 'Maintenance', 'Maintenance', 'Common build', 'change', 'Breakdowns: MTTR, MTBF by week, month, line; Breakdown Types. Do not copy the weekly MTTR bug (minutes without hours)'],
  ['Not built', 'By Shift Breakdown', 'By Shift Breakdown', 'Common build', 'table', 'Run Rates (new) and Volume CoV (new): average run rate, % Adherence, CoV per shift'],
  ['Not built', 'By Format Breakdown', 'By Format Breakdown', 'Common build', 'source', 'Run Rates (new) and Format List (new); Nottingham Format List file missing (D4)'],
  ['Not built', 'OEE Trending', 'OEE Trending', 'Common build', 'change', 'OEE against target by year, month, week, line, department'],
  ['Not built', 'Historical OEE', 'Historical OEE', 'Common build', 'archive', 'Archive Jan 2022 to Nov 2024 (old method), simple average of daily OEE'],
  ['Not built', 'Loss Tree', 'Monthly breakdown', 'Common build', 'change', 'Same measures, two layouts: 14 periods (Nottingham) or year x month x week (Hull)'],
  ['Not built', 'Unplanned Loss Tree', 'Unplanned Losses (frequency)', 'Common build, grouping to confirm', 'change', 'Hours by sub group x stop and x equipment / stop counts'],
  ['Not built', 'Volume Trending', '-', 'Separate Nottingham build', 'source', 'Good parts of packing lines only; volume target is a hard-coded number (D6)'],
  ['Not built', '-', 'OEE/LOSS GRAPH', 'Separate Hull build', 'change', 'Weekly OEE against unplanned Loss %'],
];

// ---- Content: EU filters (page 2) ---------------------------------------------
const RULES = [
  ['Nottingham, Plan OPT', 'EU keeps only areas SD Packing and " Strepsils Packing" (leading space), not S14'],
  ['Nottingham, Time Utilisation', 'EU keeps a list of 23 packing lines'],
  ['Nottingham, Daily losses', 'EU drops Bosch, Fette 23, Fette12, Fette2, Fette20, Fette4, Fette5, Gran0, S14'],
  ['Nottingham, Run Rates / Volume CoV', 'EU drops S14 / the process machines (Basing, Fette21, Gran, coating, Vision...)'],
  ['Nottingham, Machine Names', 'EU keeps the two packing areas: 25 of 66 machines'],
  ['Hull, plan, util, losses, CoV', 'EU drops 19 process machines (4 Tonne, 6 Tonne, 6000L, GG4 to GG7, Lemsip Process, Senokot Press, "Bosch Capsulator "...)'],
  ['Hull, Machine Names', 'EU keeps Dept Dries Pack and Liquids Pack'],
];
const KEPT = 'Dropped in both reports, stays in the build: Nottingham N11 Auto (plan side), B1 - Auto, B4 Auto, B5 Auto (losses); Hull GT4 - Auto.';

// ---- Content: sources, build, tables (page 3) --------------------------------
// [key, level, title, detail]
const SOURCES = [
  ['plan', 'have', 'Provideam Plan OPT (month files)', 'all machines, in the lake'],
  ['loss', 'have', 'Provideam Line Losses + Volume Loss Correction', 'all machines, in the lake'],
  ['rr', 'table', 'Provideam Run Rates (month files)', 'hourly; Aug, Sep, Oct 2026 local; not in the lake yet'],
  ['hist', 'archive', 'Historical OEE archive files', 'Nottingham 42,401 rows (2022-01 to 2024-11), Hull 28,944 rows (2022-01 to 2024-10)'],
  ['ref', 'have', 'Reference: Glidepaths, Machine Names, Shift Patterns, Equipment Coding', 'copied by hand to the lake; Glidepaths change during the year'],
  ['fmt', 'source', 'Reference: Format List', 'Hull, Weinheim, Mira local; Nottingham missing'],
  ['sih', 'have', 'SIH API (SIH report daily tab)', 'Hull B2 Line + 7 machines, GT4; Nottingham N1 not configured'],
];
const BUILDS = [
  ['pbi', 'have', 'PBI report build tab (164 of 200 nodes)', 'existing lanes + C1 column; new lanes: Run Rates, Volume CoV, Format List job'],
  ['sihb', 'have', 'Hull SIH report daily tab (195 of 200 nodes)', 'writes the same 3 tables; Run Rates output does not fit: new tab or split (D9)'],
  ['once', 'archive', 'One-time conversion + upload', 'archive never changes; no flow'],
];
const TABLES = [
  ['t1', 'change', 'Plan_OPT_EU', '+ In EU Report'],
  ['t2', 'change', 'Time_Utilisation_EU', '+ In EU Report'],
  ['t3', 'change', 'Daily_Losses_EU', '+ In EU Report'],
  ['t4', 'table', 'Run_Rates_EU (new)', 'hour x machine x part'],
  ['t5', 'table', 'Volume_CoV_EU (new)', 'day x shift x machine, groups over 1,000 parts'],
  ['t6', 'source', 'Format_List_EU (new)', 'machine + product: brand, size, count'],
  ['t7', 'archive', 'Historical_OEE_EU (new)', 'machine x day, OEE / A / P'],
];
// [from, to]
const FLOWS = [
  ['plan', 'pbi'], ['loss', 'pbi'], ['rr', 'pbi'], ['ref', 'pbi'], ['fmt', 'pbi'],
  ['ref', 'sihb'], ['sih', 'sihb'], ['hist', 'once'],
  ['pbi', 't1'], ['pbi', 't2'], ['pbi', 't3'], ['pbi', 't4'], ['pbi', 't5'], ['pbi', 't6'],
  ['sihb', 't1'], ['sihb', 't2'], ['sihb', 't3'], ['once', 't7'],
];

// ---- Content: SIH coverage (page 4) ------------------------------------------
// [need, Provideam today, SIH, level, gap on SIH lines]
const SIH = [
  ['Plan: Good Parts, Capacity, part, shift', 'Plan OPT export', 'SIH report daily', 'have', 'grain machine x day x shift x product; Capacity depends on design speeds'],
  ['Time Utilisation', 'Plan OPT export', 'SIH report daily', 'have', 'minutes cut to whole minutes'],
  ['Losses: group, sub group, stop, equipment', 'Line Losses + Equipment Coding', 'SIH report daily (reason tree, alarm texts)', 'have', '68 % of stops without category; SIH has a loss tree, not mapped yet (D11)'],
  ['Losses: comment text', 'Line Losses', 'comment count only', 'none', 'deep dive in a later session (D10)'],
  ['Targets (OEE, PDT, UPDT, loss)', 'Glidepaths', 'Glidepaths (reference file)', 'have', 'loss targets fill only where SIH sub group names match'],
  ['Dept, Area, Product Type', 'Machine Names', 'Machine Names (reference file)', 'have', 'none'],
  ['Shift (Hull colour)', 'Shift Patterns', 'calendar names (Red, Gold...)', 'have', 'some calendars use Yellow, Morning Shift...'],
  ['Run Rates', 'Run Rates export', 'hourly KPIs already read', 'table', 'a new output, no new API call (D9)'],
  ['Volume CoV', 'grouped plan rows', 'grouped SIH plan rows', 'table', 'built the same way'],
  ['Format List', 'Formats file', 'none (no brand or pack size in SIH)', 'source', 'SIH product names need a mapping (D12)'],
  ['Historical OEE', 'archive files', 'none (before SIH)', 'archive', 'static'],
  ['Volume target', 'hard-coded number', 'none', 'source', 'Reckitt (D6)'],
  ['Hull Availability / Performance', 'Daily Performance Metrics', 'evaluateKPIs per asset and day', 'have', 'only if D8 keeps the gauges'],
];

// ---- Content: decisions (page 5) ----------------------------------------------
// [id, group, decision, who, recommendation, note of the user (2026-10-23)]
const DECISIONS = [
  ['D1', 'segun', 'EU filters become the column In EU Report; Machine Names lookup no longer filtered', 'User, Segun', 'Yes: EU pages filter the column and keep their numbers', ''],
  ['D2', 'segun', 'New tables Run_Rates_EU and Volume_CoV_EU in the PBI report build', 'User, Segun', 'Yes; Run Rates from Aug 2026 unless more history is needed', 'Run Rates is a new lane of the PBI report build (room: 164 of 200 nodes)'],
  ['D3', 'segun', 'New table Format_List_EU from the reference Format List files', 'User, Segun', 'Yes', ''],
  ['D5', 'segun', 'Historical OEE as a one-time upload; simple average in Tableau', 'User, Segun', 'Yes', ''],
  ['D8', 'segun', 'Hull Availability / Performance gauges (Hull Homepage only)', 'User, Segun, Reckitt', 'Skip for now; SIH has the values', ''],
  ['D9', 'segun', 'Run Rates for SIH lines', 'User', 'Yes with D2; the Hull SIH tab is full (195 of 200 nodes): a second tab or a split', ''],
  ['D13', 'segun', 'EU and site views in one workbook: In EU Report, S14 (VSU) and packing-only filters', 'Segun', 'Page filters in Tableau', ''],
  ['D4', 'reckitt', 'Nottingham Format List: who fills it', 'Reckitt (Nottingham)', 'We make the starter list (machine + part names), Nottingham fills brand, size, count', 'Nottingham said there is a way to make it: ask again'],
  ['D6', 'reckitt', 'Volume target: source and grain', 'Reckitt', 'Tableau parameter until a source exists', ''],
  ['D7', 'reckitt', 'Hull glidepath master: regional file (used now) or site V7 file (524 cells differ in 2026)', 'Reckitt (Hull)', 'Keep the regional file meanwhile', 'Glidepaths are updated during the year (Nottingham): agree who updates which file and how it reaches the lake'],
  ['D12', 'reckitt', 'Format List for SIH lines: SIH product names against Provideam part names', 'Reckitt, user', 'A mapping per line when it switches', ''],
  ['D10', 'later', 'Comment text for SIH lines (only a count exists)', 'User, then Reckitt / Siemens', 'Accept empty comments for now', 'Look deeper in a separate session'],
  ['D11', 'later', 'SIH loss tree to report groups and sub groups', 'User, then Reckitt', 'Needed before a line switches for the loss pages', 'SIH has a loss tree; find out why stops do not map to it (68 % without category)'],
  ['D14', 'later', 'Parked differences (next page): escalate when the setup is finished', 'User, then Reckitt', 'Keep one register; escalate per line before it switches', 'Known, ignored on purpose until the SIH setup is finished'],
];
const GROUPS = [
  ['segun', 'Decide with Segun and the team'],
  ['reckitt', 'Ask Reckitt'],
  ['later', 'Deep dive later / parked'],
];

// ---- Content: parked differences (page 6) --------------------------------------
// [area, difference, where it is written, escalate when]
const PARKED = [
  ['Loss reasons', 'SIH stops carry machine alarm texts; 68 % have no category (Not Logged / Unplanned Downtime). Provideam has operator reasons', 'docs/sih-report-daily.md (1)', 'before a line switches for the loss pages'],
  ['Loss tree', 'SIH has a loss tree, but the stops do not reach its categories yet (state table mapping?)', 'D11', 'now (investigate), then Reckitt'],
  ['Equipment', 'SIH uses the reason sub group; Provideam the Equipment Coding file', 'docs/sih-report-daily.md (2)', 'with the loss tree'],
  ['Comments', 'SIH has a comment count only, no text', 'docs/sih-report-daily.md (8), D10', 'after the deep dive'],
  ['Operator stops', 'No field tells an operator stop from a machine fault; a rule on the reason tree is needed', 'docs/shift-report-flow.md', 'with the loss tree'],
  ['Shift names', 'Some calendars use Yellow, Morning Shift, Second Shift (not report shifts)', 'docs/sih-report-daily.md (3)', 'when the calendars are set up'],
  ['Capacity', 'Capacity = design speed x minutes; B2 Line once showed performance above 100 %', 'docs/kpis.md, step 4', 'when design speeds are set up'],
  ['Plan grain', 'SIH: machine x day x shift x product; Provideam: one row per run', 'docs/sih-report-daily.md (7)', 'only if Tableau totals differ'],
  ['Minutes, parts', 'SIH minutes cut to whole minutes; fractional parts on manual lines rounded', 'docs/sih-report-daily.md (6)', 'only if totals differ'],
  ['AreaName', 'Empty for SIH rows (Tableau uses Area)', 'docs/sih-report-daily.md (5)', 'no action'],
  ['Format List names', 'SIH product names differ from Provideam part names', 'D12', 'before a line switches for By Format'],
  ['Heavy days', 'Siemens setup error: evaluateKPIs 413, over 5,000 stops a day; days left failing', 'docs/sih-report-daily.md', 'Siemens fix, then rerun'],
  ['Stop across window start', 'A stop that starts before the day is dropped whole (15 to 20 min per machine)', 'docs/shift-report-flow.md', 'decision of the user'],
  ['Glidepath files', 'Hull site V7 and regional differ (524 cells); Nottingham downtime targets: fractions in the site file, 39 cells differ beyond rounding', 'D7, analysis 3.1', 'now (Reckitt)'],
  ['Weinheim part names', 'The build cuts the part code; the SIH tab does not', 'docs/sih-report-daily.md (10)', 'when a Weinheim line is added'],
];

// ---- Writer (same as the other drawio builders) --------------------------------
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
    return `d${this.index}c${this.n}`;
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
    let head = `<diagram name="${esc(this.name)}" id="site${this.index}">`;
    head += '<mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" ';
    head += 'connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">';
    head += '<root><mxCell id="0"/><mxCell id="1" parent="0"/>';
    return `${head}${this.cells.join('')}</root></mxGraphModel></diagram>`;
  }
}

function legend(page, x, y, keys) {
  let top = y;
  for (const key of keys) {
    page.box(x, top, 240, 30, bold(LEVEL[key].label), key);
    top += 40;
  }
  return top;
}

// One table row of boxes with a shared height. cols: [width, html, level]
function row(page, x, y, cols, minHeight = 30) {
  const h = Math.max(minHeight, ...cols.map(([w, , , plain]) => fit(w, [plain])));
  let left = x;
  for (const [w, html, level] of cols) {
    page.box(left, y, w, h, html, level);
    left += w + 6;
  }
  return y + h + 6;
}

const LEVELS_ALL = ['have', 'change', 'table', 'archive', 'source', 'none'];

// ---- Page 1: agreed pages -------------------------------------------------------
const p1 = new Page('Site dashboards: agreed pages', 0);
let title = bold('One workbook: EU and site pages (Nottingham model) and the data each page needs');
title += `<br>${small('Agreed with Reckitt: EU, Nottingham and Hull dashboards become one Tableau workbook. Colour of the last column = what the page needs beyond our tables today.')}`;
title += `<br>${small('Read from the .pbit templates (model and pages) on 2026-10-23. Details: prompt-response/site-dashboards-analysis.md, sections 2.1 and 3.')}`;
p1.text(40, 20, 1300, 70, title);
legend(p1, 1400, 20, LEVELS_ALL);
const W1 = [210, 170, 200, 220, 460];
let y = 110;
y = row(p1, 40, y, [
  [W1[0], bold('EU dashboard'), 'grey', 'EU dashboard'],
  [W1[1], bold('Nottingham'), 'grey', 'Nottingham'],
  [W1[2], bold('Hull'), 'grey', 'Hull'],
  [W1[3], bold('Common build'), 'grey', 'Common build'],
  [W1[4], bold('Data needed'), 'grey', 'Data needed'],
]);
for (const [eu, n, h, common, level, need] of PAGES) {
  y = row(p1, 40, y, [
    [W1[0], esc(eu), 'neutral', eu],
    [W1[1], esc(n), 'neutral', n],
    [W1[2], esc(h), 'neutral', h],
    [W1[3], esc(common), 'neutral', common],
    [W1[4], `${bold(LEVEL[level].label)}<br>${esc(need)}`, level, `${LEVEL[level].label} ${need}`],
  ]);
}
y += 20;
let note = bold('Reading the colours');
note += `<br>${esc('Yellow: the page uses only columns we have, but needs the machines the EU report drops (manufacturing and process machines, S14). That is change C1 (page "Site data: EU filters").')}`;
note += `<br>${esc('Not used by any page, so not needed: Plan OPT ShiftStartTime, Defect Parts, Target, OEE; the Hull raw shift name (the colour is already in ShiftName).')}`;
p1.box(40, y, 1290, 80, note, 'neutral');

// ---- Page 2: EU filters ------------------------------------------------------------
const p2 = new Page('Site data: EU filters (C1)', 1);
title = bold('Why the site pages need more rows than our tables: the EU report drops machines on purpose');
title += `<br>${small('The site dashboards use the same Provideam files and the same query steps as the EU report, without the EU filters. Our build copies the EU filters today.')}`;
p2.text(40, 20, 1300, 50, title);
const left = 40;
let ly = 100;
const a1 = p2.box(left, ly, 300, 60, `${bold('Provideam files')}<br>${small('all machines of the site')}`, 'have');
const a2 = p2.box(left + 380, ly, 320, 60, `${bold('Build today')}<br>${small('EU rules DROP the rows')}`, 'none');
const a3 = p2.box(left + 780, ly, 320, 60, `${bold('Our 3 tables today')}<br>${small('packing lines only: EU pages fine, site pages miss machines')}`, 'grey');
p2.edge(a1, a2, '#666666');
p2.edge(a2, a3, '#666666');
ly += 110;
const b1 = p2.box(left, ly, 300, 60, `${bold('Provideam files')}<br>${small('all machines of the site')}`, 'have');
const b2 = p2.box(left + 380, ly, 320, 60, `${bold('Build proposed (C1)')}<br>${small('the same EU rules SET In EU Report = true / false')}`, 'change');
const b3 = p2.box(left + 780, ly, 320, 60, `${bold('Our 3 tables + In EU Report')}<br>${small('all machines; Machine Names lookup unfiltered')}`, 'change');
const b4 = p2.box(left + 1180, ly - 40, 260, 50, `${bold('EU pages')}<br>${small('filter In EU Report = true: same numbers')}`, 'have');
const b5 = p2.box(left + 1180, ly + 50, 260, 50, `${bold('Site pages')}<br>${small('no EU filter; S14 / packing filters per page')}`, 'have');
p2.edge(b1, b2, '#666666');
p2.edge(b2, b3, '#666666');
p2.edge(b3, b4, '#82b366');
p2.edge(b3, b5, '#82b366');
ly += 130;
p2.text(left, ly, 900, 30, bold('The EU rules (they move into the column, unchanged)'));
ly += 34;
for (const [scope, rule] of RULES) {
  ly = row(p2, left, ly, [
    [300, bold(scope), 'grey', scope],
    [800, esc(rule), 'neutral', rule],
  ]);
}
ly += 10;
p2.box(left, ly, 1106, fit(1106, [KEPT]), esc(KEPT), 'neutral');
ly += fit(1106, [KEPT]) + 16;
const size = 'Size: Nottingham plan rows about 2.4 times (Sep 2026: 1,132 to 2,744). Proof when built: the rows with In EU Report = true equal today\'s files.';
p2.box(left, ly, 1106, fit(1106, [size]), esc(size), 'neutral');

// ---- Page 3: sources, build, tables ------------------------------------------------
const p3 = new Page('Site data: sources, build, tables', 2);
title = bold('Where the site data comes from and which tables it becomes (proposal, nothing built)');
title += `<br>${small('Left: sources. Middle: where it is built. Right: the tables Tableau reads (eu_report/report/<table>/). Each table holds Provideam and SIH rows side by side; a line switches with reportSource in Config.')}`;
p3.text(40, 20, 1300, 50, title);
legend(p3, 1400, 20, ['have', 'change', 'table', 'archive', 'source']);
const ids = {};
let sy = 100;
for (const [key, level, name, detail] of SOURCES) {
  const h = fit(340, [name, detail]);
  ids[key] = p3.box(40, sy, 340, h, `${bold(name)}<br>${small(detail)}`, level);
  sy += h + 20;
}
let by = 140;
for (const [key, level, name, detail] of BUILDS) {
  const h = fit(320, [name, detail]) + 10;
  ids[key] = p3.box(500, by, 320, h, `${bold(name)}<br>${small(detail)}`, level);
  by += h + 90;
}
let ty = 100;
for (const [key, level, name, detail] of TABLES) {
  const h = fit(300, [name, detail]);
  ids[key] = p3.box(960, ty, 300, h, `${bold(name)}<br>${small(detail)}`, level);
  ty += h + 20;
}
for (const [from, to] of FLOWS) {
  const dashed = from === 'sih' || from === 'sihb';
  p3.edge(ids[from], ids[to], dashed ? '#6c8ebf' : '#666666', dashed);
}
const tail = 'Blue dashed: the SIH side (Hull lines configured in SIH). Calculated in Tableau, no table: Calendar, the 14 periods, Loss in CUs, minutes and hours, running %, Capacity Checker, all measures; targets / 100.';
p3.box(40, Math.max(sy, by, ty) + 20, 1220, fit(1220, [tail]), esc(tail), 'neutral');

// ---- Page 4: SIH coverage ---------------------------------------------------------
const p4 = new Page('Site data: what SIH can give', 3);
title = bold('Every data need: Provideam today and the SIH source for a line that has switched');
title += `<br>${small('Coverage today: Hull B2 Line + 7 machines and GT4 in SIH; Nottingham N1 not configured. Plan to switch lines exists. Columns are not the limit: the loss reasons and comments are.')}`;
p4.text(40, 20, 1300, 50, title);
legend(p4, 1400, 20, ['have', 'table', 'archive', 'source', 'none']);
const W4 = [250, 210, 260, 420];
y = 100;
y = row(p4, 40, y, [
  [W4[0], bold('Need'), 'grey', 'Need'],
  [W4[1], bold('Provideam today'), 'grey', 'Provideam today'],
  [W4[2], bold('SIH source'), 'grey', 'SIH source'],
  [W4[3], bold('Gap on SIH lines'), 'grey', 'Gap on SIH lines'],
]);
for (const [need, prov, sih, level, gap] of SIH) {
  y = row(p4, 40, y, [
    [W4[0], bold(need), 'neutral', need],
    [W4[1], esc(prov), 'neutral', prov],
    [W4[2], esc(sih), level, sih],
    [W4[3], esc(gap), 'neutral', gap],
  ]);
}

// ---- Page 5: decisions --------------------------------------------------------------
const p5 = new Page('Discussion: open decisions', 4);
title = bold('Open decisions for the discussion (nothing is built yet)');
title += `<br>${small('Grouped by who decides. Green note = remark of the user (2026-10-23). Numbers as in prompt-response/site-dashboards-analysis.md section 5.')}`;
p5.text(40, 20, 1300, 50, title);
const W5 = [60, 380, 160, 330, 330];
y = 90;
for (const [group, label] of GROUPS) {
  p5.text(40, y, 900, 26, bold(label));
  y += 30;
  y = row(p5, 40, y, [
    [W5[0], bold('#'), 'grey', '#'],
    [W5[1], bold('Decision'), 'grey', 'Decision'],
    [W5[2], bold('Who'), 'grey', 'Who'],
    [W5[3], bold('Recommendation'), 'grey', 'Recommendation'],
    [W5[4], bold('Note'), 'grey', 'Note'],
  ]);
  for (const [id, g, decision, who, rec, userNote] of DECISIONS) {
    if (g !== group) {
      continue;
    }
    y = row(p5, 40, y, [
      [W5[0], bold(id), 'neutral', id],
      [W5[1], esc(decision), 'neutral', decision],
      [W5[2], esc(who), 'neutral', who],
      [W5[3], esc(rec), 'neutral', rec],
      [W5[4], esc(userNote), userNote ? 'have' : 'neutral', userNote],
    ]);
  }
  y += 24;
}

// ---- Page 6: parked differences ------------------------------------------------------
const p6 = new Page('Parked: SIH vs Provideam differences', 5);
title = bold('Known differences between SIH and Provideam, parked until the SIH setup is finished');
title += `<br>${small('One register, so nothing is forgotten. Escalate to Reckitt per line before it switches to SIH, or at the moment named in the last column.')}`;
p6.text(40, 20, 1300, 50, title);
const W6 = [170, 560, 260, 260];
y = 90;
y = row(p6, 40, y, [
  [W6[0], bold('Area'), 'grey', 'Area'],
  [W6[1], bold('Difference'), 'grey', 'Difference'],
  [W6[2], bold('Written in'), 'grey', 'Written in'],
  [W6[3], bold('Escalate when'), 'grey', 'Escalate when'],
]);
for (const [area, diff, where, when] of PARKED) {
  y = row(p6, 40, y, [
    [W6[0], bold(area), 'neutral', area],
    [W6[1], esc(diff), 'neutral', diff],
    [W6[2], esc(where), 'neutral', where],
    [W6[3], esc(when), when.startsWith('now') ? 'source' : 'neutral', when],
  ]);
}

// ---- Reference pages: the Power BI data map, unchanged ------------------------------
const reference = readFileSync(REFERENCE, 'utf8');
const copied = [...reference.matchAll(/<diagram\b[\s\S]*?<\/diagram>/g)].map((m) =>
  m[0].replace(/(<diagram\b[^>]*\bname=")([^"]*)"/, (all, start, name) =>
    `${start}${REFERENCE_PREFIX}${name}"`),
);

// ---- Write -----------------------------------------------------------------------------
const pages = [p1, p2, p3, p4, p5, p6];
let out = `<mxfile host="build-drawio-site-dashboards.js" type="device" pages="${pages.length + copied.length}">`;
out += pages.map((p) => p.xml()).join('');
out += copied.join('');
out += '</mxfile>\n';
writeFileSync(OUTPUT, out);
console.log(`Wrote ${OUTPUT}: ${pages.length} new pages + ${copied.length} pages of ${REFERENCE}`);
