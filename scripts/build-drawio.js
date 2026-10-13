// Builds diagrams/powerbi-data-map.drawio: the Power BI data overview, one page
// per Power BI table (column, example, arrow to our column, difference) and a
// page for the tables we have not created.
// Inputs: Power BI template (.pbit), report (.pbix), the mapping workbook,
// sample files of the report, and diagrams/data/ours-profile.json
// (made by scripts/helper-profile-parquet.py from the lake files).
// Usage: node scripts/build-drawio.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readXlsx, readPbitModel, readPbixUsage } from './lib-office.js';

// ---- Settings: paths and layout -------------------------------------------
const ROOT = 'C:/WORK/IBM-RECKITT/';
const REPLICA = `${ROOT}ReportReplica/EU Daily OEE Report 2025 V1 1/`;
const PBIT = `${REPLICA}Temp EU Daily OEE Report 2025 V1 1.pbit`;
const PBIX = `${REPLICA}EU Daily OEE Report 2025 V1 1.pbix`;
const MAPPING = `${ROOT}Reckitt_IH_vs_PowerBI_Overview_mapping.xlsx`;
const SAMPLE_DIR = `${ROOT}ReportReplica/Seguns/`;
const PROFILE = 'diagrams/data/ours-profile.json';
const OUTPUT = 'diagrams/powerbi-data-map.drawio';
// Filled share below this value counts as "partly filled".
const FULL = 0.995;

// ---- The six tables we create ----------------------------------------------
const TABLES = [
  { pbi: 'Machine Names EU', ours: 'pbi_machine_name', shown: 'pbi_machine_names', sample: 'Machine Names EU.xlsx' },
  { pbi: 'Plan OPT EU', ours: 'pbi_plan_opt', shown: 'pbi_plan_opt', sample: 'Plan OPT EU.xlsx' },
  { pbi: 'Time Utilisation EU', ours: 'pbi_time_utilisation', shown: 'pbi_time_utilisation' },
  { pbi: 'Daily Losses EU', ours: 'pbi_daily_losses', shown: 'pbi_daily_losses' },
  { pbi: 'Shift Naming EU', ours: 'pbi_shift_naming', shown: 'pbi_shift_naming' },
  { pbi: 'Calendar', ours: 'pbi_calendar', shown: 'pbi_calendar' },
];

// Our column for a Power BI column when the plain rule does not give it.
const OUR_NAME = {
  Comment: 'comment_count',
  OEELossLvl3Group: 'loss_lvl3_group',
  OEELossLvl3SubGroup: 'loss_lvl3_sub_group',
  OEELossLvl3Desc: 'loss_lvl3_desc',
};

// Notes written by hand where the mapping workbook is out of date or we know
// more now. Key: "Power BI table|column". level: ok, assumed, empty, none.
const NOTE = {
  'Machine Names EU|Product Type': ['empty', 'Not in Insights Hub. Needs a Reckitt master file or a per-asset value in Config. Values for Hull still to get.'],
  'Machine Names EU|Unique Machine Name': ['assumed', 'Ours = Insights Hub asset ID. Copy = machine-site text (Line 5-Weinheim). It is the hidden join key of every fact table. Decision open.'],
  'Machine Names EU|Dept': ['assumed', 'Insights Hub has no department: the area is used (same value as Area).'],
  'Machine Names EU|Area': ['assumed', 'Insights Hub area names (Bottles, Blisters). The copy has its own area names. Accepted.'],
  'Plan OPT EU|Unique Machine Name': ['assumed', 'Ours = Insights Hub asset ID (see Machine Names EU). Copy: machine-site text. Decision open.'],
  'Plan OPT EU|AreaName': ['assumed', 'Insights Hub area names. The copy has its own. Accepted.'],
  'Plan OPT EU|Date': ['assumed', 'Production day 06:00 to 06:00 UTC. Copy: calendar date. Not crucial: a window setting plus a backfill.'],
  'Plan OPT EU|ShiftName': ['assumed', 'Names come from the Insights Hub calendar (Blue, Red, Yellow, Gold, Green, Shift 1, Shift 2). Copy: crew colours and Day/Afternoon/Night. Accepted; each name must exist in Shift Naming.'],
  'Plan OPT EU|PartName': ['assumed', 'Product description, else name. Empty where no product was found for the day (B2 Line 1-3 and 8-14 Sep; GT4 29 Sep, 3 and 6-8 Oct).'],
  'Plan OPT EU|Product Key': ['assumed', 'Product code. Copy: machine + part name (join key to the product table). Decision: own product table, key still open.'],
  'Plan OPT EU|Good Parts': ['ok', 'Decimal (manual GT4 entries are spread over hours). Copy: whole numbers.'],
  'Plan OPT EU|Capacity': ['assumed', 'Assumption: design speed per minute x planned minutes. In the copy the speed is constant for only 56% of machine/part pairs. Must be clarified.'],
  'Plan OPT EU|Downtime Units': ['assumed', 'Assumption: design speed per minute x downtime minutes.'],
  'Plan OPT EU|Total Time': ['assumed', 'Assumption: time with a shift planned (total time minus shift-plan stop). Copy: 720 or 480 per shift.'],
  'Plan OPT EU|Planned OpT': ['assumed', 'Assumption: operational time (total time minus planned stops).'],
  'Plan OPT EU|OEE Time': ['assumed', 'KPI used operational time. Copy: about good parts / design speed. Empty when Insights Hub has no product speed.'],
  'Plan OPT EU|OEE Target': ['empty', 'Glidepaths files from Reckitt (monthly target per machine). Not available yet.'],
  'Plan OPT EU|PDT Target': ['empty', 'Glidepaths files from Reckitt (monthly target per machine). Not available yet.'],
  'Plan OPT EU|UPDT Target': ['empty', 'Glidepaths files from Reckitt (monthly target per machine). Not available yet.'],
  'Time Utilisation EU|Unique Machine Name': ['assumed', 'Ours = Insights Hub asset ID (see Machine Names EU). Decision open.'],
  'Time Utilisation EU|Date': ['assumed', 'Follows the Plan OPT date (production day).'],
  'Time Utilisation EU|Total Time Total': ['assumed', 'Sum of Plan OPT Total Time per machine and day. Follows its assumption.'],
  'Time Utilisation EU|Planned OPT Total': ['assumed', 'Sum of Plan OPT Planned OpT per machine and day. Follows its assumption.'],
  'Time Utilisation EU|OEE Time Total': ['assumed', 'Sum of Plan OPT OEE Time per machine and day. Empty where there is no product speed.'],
  'Time Utilisation EU|All Time': ['ok', '1440 minutes per machine and day.'],
  'Daily Losses EU|Unique Machine Name': ['assumed', 'Ours = Insights Hub asset ID (see Machine Names EU). Decision open.'],
  'Daily Losses EU|Date': ['assumed', 'Site local time (Europe/London only). Other sites and daylight saving still open.'],
  'Daily Losses EU|Time': ['assumed', 'Site local time (Europe/London only). Other sites and daylight saving still open.'],
  'Daily Losses EU|ShiftName': ['assumed', 'Names come from the Insights Hub calendar. Copy uses crew colours and Day/Afternoon/Night. Accepted.'],
  'Daily Losses EU|Duration': ['assumed', 'Decimal minutes. Copy: whole minutes. 14 long B2 stops had a duration shorter than their span (open point).'],
  'Daily Losses EU|Loss Units': ['assumed', 'Assumption: design speed per minute x stop minutes, no Volume Loss Correction. Empty where no product.'],
  'Daily Losses EU|OEELossLvl3Group': ['assumed', 'Rule: planned roots from Config = Planned Loss, default reason = Not Logged, rest = Unplanned Loss. Planned stops not verified in the API data.'],
  'Daily Losses EU|OEELossLvl3SubGroup': ['assumed', 'Stand-in from the reason tree level. Mapping of the B2 alarm stops needed from Reckitt.'],
  'Daily Losses EU|OEELossLvl3Desc': ['ok', 'Leaf reason text. To confirm it is what the report expects.'],
  'Daily Losses EU|Loss Final Level': ['ok', 'Leaf reason text. To confirm it is what the report expects.'],
  'Daily Losses EU|Equipment': ['assumed', 'B2: second reason level (Capper, Infeed ...). Power BI gets it from Equipment Coding files.'],
  'Daily Losses EU|Breakdown Types': ['assumed', 'Reason subgroup under Breakdown (Mechanical, Electrical). Needs the real reason tree.'],
  'Daily Losses EU|Batch ID': ['assumed', 'Order from the OEE order filter (decision 2026-10-12). Empty where no order was found.'],
  'Daily Losses EU|Comment': ['assumed', 'Copy: comment text. Ours: comment count only (always 0 so far). Text not read.'],
  'Daily Losses EU|PartName': ['assumed', 'Product running at the stop (description, else name). Empty where no product was found.'],
  'Daily Losses EU|Product Key': ['assumed', 'Product code. Copy: machine + part name. Decision: own product table, key open.'],
  'Daily Losses EU|Loss Target Key': ['assumed', 'Ours: machine|subgroup|month. Only useful once the Glidepaths targets exist.'],
  'Daily Losses EU|Value': ['empty', 'Monthly target per machine and loss subgroup (Glidepaths from Reckitt). Not available yet.'],
  'Daily Losses EU|Target': ['empty', 'Value / 100. Empty while Value is empty.'],
  'Daily Losses EU|Volume Key': ['assumed', 'Ours: machine|month. Joins to the volume targets, which we do not have.'],
  'Daily Losses EU|Volume Total': ['empty', 'Good parts per machine and month on every loss row. Needs several days; not built.'],
  'Daily Losses EU|Merged': ['none', 'Power BI helper key for the Equipment Coding join. Not rebuilt.'],
  'Daily Losses EU|Volume Key.1': ['none', 'Duplicate of Volume Key. Not rebuilt.'],
  'Daily Losses EU|ShiftName - Copy': ['none', 'Copy of ShiftName made in Power Query. Not rebuilt.'],
  'Shift Naming EU|Shift': ['assumed', 'Names come from the Insights Hub calendars. Every shift name used in the facts must be in this table.'],
};

// Table notes shown at the top of each table page.
const TABLE_NOTE = {
  'Machine Names EU': 'Only the machines of the Config tab (Hull: 2). The copy lists 76 machines of all sites.',
  'Plan OPT EU': 'One row per production day, machine, shift and product. Dates are text yyyy-mm-dd in our files (parquet has no date type).',
  'Time Utilisation EU': 'Our own sums of Plan OPT per machine and day. The copy loads it from files.',
  'Daily Losses EU': 'One row per stop. Dates and times are text in our files.',
  'Shift Naming EU': 'Every shift name used in the fact tables must exist here (relationship).',
  Calendar: 'Dates from the calendarStart and calendarEnd settings of the flow. Monday week start.',
};

// ---- Helpers ---------------------------------------------------------------
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bold = (s) => `<b>${esc(s)}</b>`;
const small = (s) => `<font style="font-size:9px" color="#555555">${esc(s)}</font>`;

function snake(name) {
  if (OUR_NAME[name]) {
    return OUR_NAME[name];
  }
  if (name.includes(' ') || name.includes('.')) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function excelDate(serial) {
  const ms = Date.UTC(1899, 11, 30) + Number(serial) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Parquet types: Datetime(time_unit='ms', ...) becomes Datetime.
const typeName = (t) => t.replace(/(.*)/, '');

// Long hex strings (asset ids) are shortened in the examples.
const shorten = (v) => (/^[0-9a-f]{32}$/.test(v) ? `${v.slice(0, 8)}...` : v);

// Example values: long decimals are rounded, long text is cut.
function tidy(v) {
  let text = String(v);
  if (/^-?d+.d{5,}$/.test(text)) {
    text = String(Math.round(Number(text) * 10000) / 10000);
  }
  return text.length > 46 ? `${text.slice(0, 45)}...` : text;
}

// Colours per level.
const COLOR = {
  ok: ['#d5e8d4', '#82b366'],
  partial: ['#fff2cc', '#d6b656'],
  assumed: ['#ffe6cc', '#d79b00'],
  empty: ['#f8cecc', '#b85450'],
  none: ['#eeeeee', '#999999'],
  neutral: ['#ffffff', '#666666'],
  pbi: ['#dae8fc', '#6c8ebf'],
  ours: ['#f5f5f5', '#666666'],
};
const LABEL = {
  ok: 'OK',
  assumed: 'ASSUMPTION',
  empty: 'EMPTY NOW',
  none: 'NOT NEEDED',
};

// ---- Diagram writer ---------------------------------------------------------
class Page {
  constructor(name) {
    this.name = name;
    this.cells = [];
    this.n = 1;
    this.index = Page.count;
    Page.count += 1;
  }

  id() {
    this.n += 1;
    return `p${this.index}c${this.n}`;
  }

  box(x, y, w, h, html, level = 'neutral', extra = '') {
    const [fill, stroke] = COLOR[level];
    const id = this.id();
    const style = `rounded=1;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;spacingLeft=8;spacingRight=6;spacingTop=2;spacingBottom=2;fontSize=11;arcSize=8;fillColor=${fill};strokeColor=${stroke};${extra}`;
    this.cells.push(
      `<mxCell id="${id}" value="${esc(html)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );
    return id;
  }

  text(x, y, w, h, html, extra = '') {
    const id = this.id();
    const style = `text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontSize=12;${extra}`;
    this.cells.push(
      `<mxCell id="${id}" value="${esc(html)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );
    return id;
  }

  edge(source, target, color = '#555555', dashed = false) {
    const id = this.id();
    const style = `edgeStyle=orthogonalEdgeStyle;html=1;endArrow=block;endFill=1;strokeWidth=1.5;strokeColor=${color};${dashed ? 'dashed=1;' : ''}`;
    this.cells.push(
      `<mxCell id="${id}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
  }

  xml() {
    return (
      `<diagram name="${esc(this.name)}" id="page${this.index}"><mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>` +
      this.cells.join('') +
      '</root></mxGraphModel></diagram>'
    );
  }
}
Page.count = 0;

// ---- Read the inputs ----------------------------------------------------------
const profile = JSON.parse(readFileSync(PROFILE, 'utf8'));
const model = readPbitModel(PBIT);
const usage = readPbixUsage(PBIX);
const mapping = readXlsx(MAPPING);
const mapRows = new Map();
for (const r of mapping['PBI column mapping'].slice(1)) {
  mapRows.set(`${r[0]}|${r[1]}`, r);
}
const summary = new Map();
for (const r of mapping['Table summary'].slice(1)) {
  summary.set(r[0], r);
}
const modelTable = (name) => model.tables.find((t) => t.name === name);

// Pages that use a table: visuals that read its columns, plus visuals that
// show a measure whose formula reads the table.
function pagesOf(tableName) {
  const pages = new Set(usage.tablePages.get(tableName) ?? []);
  const viaMeasure = new Set();
  for (const t of model.tables) {
    for (const m of t.measures) {
      if (m.expression.includes(`'${tableName}'[`)) {
        for (const p of usage.columnPages.get(`${t.name}|${m.name}`) ?? []) {
          pages.add(p);
          viaMeasure.add(p);
        }
      }
    }
  }
  const ordered = usage.pageOrder.filter((p) => pages.has(p));
  return { ordered, direct: usage.tablePages.get(tableName)?.size ?? 0, viaMeasure: viaMeasure.size };
}

// Sample rows of the copy (Plan OPT EU, Machine Names EU).
function sampleOf(table) {
  if (!table.sample) {
    return null;
  }
  const rows = readXlsx(SAMPLE_DIR + table.sample, 3).Sheet1;
  const header = rows[0];
  const first = rows[1];
  const out = new Map();
  header.forEach((h, i) => out.set(h, first[i] ?? ''));
  return out;
}

// ---- Column comparison ----------------------------------------------------------
function compare(table) {
  const mt = modelTable(table.pbi);
  const prof = profile[table.ours];
  const ourCols = new Map(prof.columns.map((c) => [c.name, c]));
  const sample = sampleOf(table);
  const used = new Set();
  const rows = mt.columns.map((col) => {
    const key = `${table.pbi}|${col.name}`;
    const ourName = snake(col.name);
    const our = ourCols.get(ourName) ?? null;
    if (our) {
      used.add(ourName);
    }
    const map = mapRows.get(key);
    const note = NOTE[key];
    let level = 'ok';
    let text = '';
    if (note) {
      [level, text] = note;
    } else if (map) {
      level = map[4] === 'Assumed' ? 'assumed' : map[4] === 'Missing' ? 'empty' : map[4] === 'Not needed' ? 'none' : 'ok';
      text = [map[6], map[7], map[8]].filter(Boolean).join('. ');
    }
    if (table.pbi === 'Calendar' && !note) {
      text = col.name === 'Date' ? 'Dates from the calendarStart and calendarEnd settings of the flow.' : 'Generated by our flow from the date (Monday week start).';
    }
    const share = our ? our.filled_share : null;
    let label = LABEL[level];
    let color = level;
    if (level === 'none') {
      label = LABEL.none;
    } else if (!our) {
      color = 'empty';
      label = 'NO COLUMN IN OURS';
    } else if (share === 0) {
      color = 'empty';
      label = 'EMPTY NOW';
    } else if (share < FULL) {
      const pct = `PARTLY FILLED ${Math.round(share * 100)}%`;
      label = level === 'assumed' ? `ASSUMPTION + ${pct}` : pct;
      color = level === 'assumed' ? 'assumed' : 'partial';
    }
    if (level === 'empty' && share !== 0 && our) {
      label = 'EMPTY NOW';
    }
    let sampleValue = null;
    if (sample && sample.has(col.name)) {
      sampleValue = sample.get(col.name);
      if (col.name === 'Date' && /^\d+$/.test(sampleValue)) {
        sampleValue = `${sampleValue} (${excelDate(sampleValue)})`;
      }
    }
    if (process.argv.includes('--list') && !note) {
      console.log(`[mapping] ${table.pbi} | ${col.name} | ${label} | ${text.slice(0, 110)}`);
    }
    return { col, our, ourName, label, color, text, sampleValue, pages: usage.columnPages.get(key)?.size ?? 0 };
  });
  const extras = prof.columns.filter((c) => !used.has(c.name));
  return { rows, extras, prof };
}

// ---- Overview page -----------------------------------------------------------------
const pages = [];
const counts = {};
const compared = new Map();
for (const t of TABLES) {
  const result = compare(t);
  compared.set(t.pbi, result);
  const c = { ok: 0, partial: 0, assumed: 0, empty: 0, none: 0, gaps: 0 };
  for (const r of result.rows) {
    c[r.color] += 1;
    if (r.our && r.our.filled_share > 0 && r.our.filled_share < FULL) {
      c.gaps += 1;
    }
  }
  counts[t.pbi] = c;
}

const overview = new Page('1 Overview');
overview.text(40, 20, 1500, 30, bold('Power BI data overview: what the report reads and what we create'), 'fontSize=18;');
overview.text(
  40,
  58,
  1500,
  60,
  'Source: the existing EU Power BI report (model template and report file, read 2026-10-12/13) and our Hull tables in the data lake (profile of 2026-10-13). ' +
    'The report also reads regional tables (N, H, W, M) directly on some pages; they are not in scope. One page per table follows.',
  'fontSize=11;',
);
// Legend
const legend = [
  ['ok', 'OK: filled and built by a known rule'],
  ['partial', 'Partly filled: has gaps'],
  ['assumed', 'Assumption or difference: check it'],
  ['empty', 'Empty now or no column: needs input'],
  ['none', 'Not needed'],
];
legend.forEach(([level, label], i) => {
  overview.box(40 + i * 300, 120, 280, 28, esc(label), level, 'fontSize=11;');
});

overview.text(40, 170, 1500, 24, bold('Tables we create today (6): each has its own page'), 'fontSize=14;');
const CARD_W = 480;
const CARD_H = 330;
TABLES.forEach((t, i) => {
  const x = 40 + (i % 3) * (CARD_W + 30);
  const y = 205 + Math.floor(i / 3) * (CARD_H + 30);
  const s = summary.get(t.pbi === 'Calendar' ? 'Calendar' : t.pbi);
  const used = pagesOf(t.pbi);
  const c = counts[t.pbi];
  const prof = profile[t.ours];
  const total = c.ok + c.partial + c.assumed + c.empty + c.none;
  const lines = [
    bold(t.pbi) + `  ->  ${bold(t.shown)}`,
    esc(`Holds: ${s ? s[1] : ''}`),
    esc(`One row is: ${s ? s[2] : ''}`),
    esc(`Our table: ${prof.rows} rows, ${prof.columns.length} columns (Hull, downloaded 2026-10-13)`),
    esc(`Used on pages: ${used.ordered.length ? used.ordered.join(', ') : 'no visual reads it directly'}${used.viaMeasure ? ' (some through measures)' : ''}`),
    esc(`Columns in Power BI: ${total}`),
  ];
  // Border colour follows the worst column.
  const worst = c.empty > 0 ? 'empty' : c.assumed > 0 ? 'assumed' : c.partial > 0 ? 'partial' : 'ok';
  overview.box(x, y, CARD_W, CARD_H - 60, lines.join('<br><br>'), worst, 'verticalAlign=top;spacingTop=8;fillColor=#ffffff;strokeWidth=3;');
  const chips = [
    ['ok', `${c.ok} OK`],
    ['partial', `${c.gaps} with gaps`],
    ['assumed', `${c.assumed} assumption`],
    ['empty', `${c.empty} empty / missing`],
    ['none', `${c.none} not needed`],
  ];
  chips.forEach(([level, label], j) => {
    overview.box(x + j * 95, y + CARD_H - 50, 90, 36, label, level, 'fontSize=10;align=center;spacingLeft=2;spacingRight=2;');
  });
});

// Keys and relationships
const keysY = 205 + 2 * (CARD_H + 30);
overview.text(40, keysY, 1500, 24, bold('How the report joins the tables (from the model)'), 'fontSize=14;');
overview.box(
  40,
  keysY + 34,
  1500,
  120,
  [
    bold('Machine key') + esc(': every fact table joins to Machine Names EU on Unique Machine Name (hidden key, never shown). Copy = machine-site text; ours = Insights Hub asset ID. Decision open.'),
    bold('Product key') + esc(': Plan OPT, Daily Losses and Run Rates join to the product master (Format List EU). Copy key = machine + part name; ours = product code. Own product table decided 2026-10-13.'),
    bold('Shift') + esc(': every fact table joins to Shift Naming EU on the shift name. All our shift names must exist there.'),
    bold('Date') + esc(': every fact table joins to Calendar on the date (Daily Losses: on the shift start date).'),
  ].join('<br><br>'),
  'neutral',
  'verticalAlign=top;spacingTop=8;',
);

// Not created: short cards
const NOT_CREATED = [
  { pbi: 'Run Rates EU', status: 'none', state: 'Decide later (group 2)', what: 'Good parts and capacity per machine, shift and product' },
  { pbi: 'Volume CoV EU', status: 'none', state: 'Decide later (group 2)', what: 'Per shift and machine: good parts sum and capacity max (volume variation)' },
  { pbi: 'Format List EU', status: 'assumed', state: 'Own product table decided (2026-10-13)', what: 'Product master: brand, unit size, unit count per machine and product', note: 'Native columns from Insights Hub; brand, size and count are not native' },
  { pbi: 'Targets Losses EU', status: 'empty', state: 'Waits for Reckitt (Glidepaths)', what: 'Monthly loss target per machine and loss subgroup' },
  { pbi: 'OEE Targets EU', status: 'empty', state: 'Waits for Reckitt (Glidepaths)', what: 'Monthly OEE target per line' },
  { pbi: 'PDT Targets EU', status: 'empty', state: 'Waits for Reckitt (Glidepaths)', what: 'Monthly planned downtime target per line' },
  { pbi: 'UPDT Targets EU', status: 'empty', state: 'Waits for Reckitt (Glidepaths)', what: 'Monthly unplanned downtime target per line' },
  { pbi: 'Equipment Coding N', shown: 'Equipment Coding (N, H, W)', status: 'empty', state: 'Waits for Reckitt files', what: 'Maps a loss key to an equipment name' },
  { pbi: 'Volume Loss Correction N', shown: 'Volume Loss Correction (N, H, W)', status: 'empty', state: 'Waits for Reckitt files', what: 'Corrects loss units by machine, loss group and time (rule not known)' },
  { pbi: 'Targets Volume N', shown: 'Targets Volume (N, H, W, M)', status: 'empty', state: 'Waits for Reckitt files', what: 'Monthly good-parts volume per machine (weight for the targets)' },
];
const ncY = keysY + 190;
overview.text(40, ncY, 1500, 24, bold('Power BI tables we have not created yet (10): columns on the last page'), 'fontSize=14;');
NOT_CREATED.forEach((t, i) => {
  const x = 40 + (i % 4) * 375;
  const y = ncY + 34 + Math.floor(i / 4) * 190;
  const used = pagesOf(t.pbi);
  const mt = modelTable(t.pbi);
  const lines = [
    bold(t.shown ?? t.pbi),
    esc(t.what),
    esc(`${mt.columns.length} columns. Used on: ${used.ordered.length ? used.ordered.join(', ') : 'no visual reads it directly'}`),
    bold(t.state),
  ];
  overview.box(x, y, 355, 170, lines.join('<br><br>'), t.status, 'verticalAlign=top;spacingTop=8;fontSize=10.5;');
});
pages.push(overview);

// ---- One page per table ------------------------------------------------------------------
const ROW = 90;
for (const t of TABLES) {
  const { rows, extras, prof } = compared.get(t.pbi);
  const s = summary.get(t.pbi);
  const used = pagesOf(t.pbi);
  const page = new Page(`${pages.length + 1} ${t.pbi}`);
  page.text(40, 20, 1500, 30, bold(`${t.pbi}  ->  ${t.shown}`), 'fontSize=18;');
  page.box(
    40,
    62,
    1260,
    96,
    [
      esc(`Holds: ${s ? s[1] : ''}. One row is: ${s ? s[2] : ''}.`),
      esc(`Our table: ${prof.rows} rows, ${prof.columns.length} columns. ${TABLE_NOTE[t.pbi] ?? ''}`),
      esc(`Used on pages: ${used.ordered.length ? used.ordered.join(', ') : 'no visual reads it directly'}${used.viaMeasure ? ' (some through measures)' : ''}`),
    ].join('<br>'),
    'neutral',
    'verticalAlign=top;spacingTop=6;fontSize=11;',
  );
  page.text(40, 172, 270, 20, bold('Power BI column') + ' (blue) and example (below it)', 'fontSize=11;');
  page.text(380, 172, 270, 20, bold('Our column') + ' and our example (below it)', 'fontSize=11;');
  page.text(700, 172, 600, 20, bold('Difference'), 'fontSize=11;');
  let y = 200;
  for (const r of rows) {
    const pbiHtml = `${bold(r.col.name)}<br>${small(`${r.col.type}${r.col.calculated ? ', calculated' : ''}${r.pages ? `, used on ${r.pages} page${r.pages > 1 ? 's' : ''}` : ''}`)}`;
    const a = page.box(40, y, 280, 38, pbiHtml, 'pbi');
    const example = r.sampleValue !== null ? `e.g. ${r.sampleValue}` : t.sample ? 'no value in the sample' : 'no sample file for this table';
    page.box(40, y + 42, 280, 40, small(tidy(example)), 'neutral', 'dashed=1;fontStyle=2;');
    let b;
    if (r.our) {
      const filled = `${Math.round(r.our.filled_share * 1000) / 10}% filled`;
      b = page.box(380, y, 280, 38, `${bold(r.our.name)}<br>${small(`${typeName(r.our.type)}, ${filled}`)}`, 'ours');
      const ex = r.our.examples.length ? `e.g. ${r.our.examples.slice(0, 2).map((e) => tidy(shorten(e))).join(' | ')}` : 'no value yet';
      page.box(380, y + 42, 280, 40, small(ex), 'neutral', 'dashed=1;fontStyle=2;');
    } else {
      b = page.box(380, y, 280, 38, `${bold('(no column)')}<br>${small('we do not create it')}`, 'empty', 'dashed=1;');
    }
    page.edge(a, b, COLOR[r.color][1], !r.our);
    page.box(700, y, 600, 82, `${bold(r.label)}<br>${esc(r.text)}`, r.color, 'verticalAlign=top;spacingTop=4;fontSize=10.5;');
    y += ROW;
  }
  if (extras.length) {
    page.text(40, y + 6, 1260, 20, bold('Columns we add that the report does not have'), 'fontSize=11;');
    page.box(
      40,
      y + 32,
      1260,
      44,
      esc(extras.map((c) => `${c.name} (${typeName(c.type)}, ${Math.round(c.filled_share * 100)}% filled)`).join('   |   ')),
      'none',
      'fontSize=10.5;',
    );
  }
  pages.push(page);
}

// ---- Page for the tables not created -----------------------------------------------------------
const nc = new Page(`${pages.length + 1} Not created yet`);
nc.text(40, 20, 1500, 30, bold('Power BI tables we have not created yet'), 'fontSize=18;');
nc.text(
  40,
  58,
  1500,
  44,
  'Columns are those of the Power BI model. The status says what the table needs. Group 2 = shift KPIs, run rate (decide later); group 3 = Glidepaths targets and correction files (waits for Reckitt). Not analysed in the model: Handover, Shift Colours, Master Mode Comment and Full Site Shift Performance are read by visuals but are not tables of the template.',
  'fontSize=11;',
);
const colY = [130, 130, 130];
NOT_CREATED.forEach((t, i) => {
  const col = i % 3;
  const mt = modelTable(t.pbi);
  const used = pagesOf(t.pbi);
  const head = [
    bold(t.shown ?? t.pbi),
    esc(t.what),
    esc(`Used on: ${used.ordered.length ? used.ordered.join(', ') : 'no visual reads it directly'}`),
    bold(t.state),
    esc(t.note ?? ''),
  ].filter(Boolean);
  const x = 40 + col * 510;
  const hHead = 150 + (t.note ? 20 : 0);
  nc.box(x, colY[col], 480, hHead, head.join('<br><br>'), t.status, 'verticalAlign=top;spacingTop=6;fontSize=10.5;');
  let y = colY[col] + hHead + 6;
  for (const c of mt.columns) {
    nc.box(x, y, 480, 24, `${esc(c.name)}  ${small(c.type)}`, 'pbi', 'fontSize=10.5;');
    y += 28;
  }
  colY[col] = y + 40;
});
pages.push(nc);

// ---- Write the file --------------------------------------------------------------------------------
const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="build-drawio.js" version="24.0.0">` +
  pages.map((p) => p.xml()).join('') +
  '</mxfile>\n';
mkdirSync('diagrams', { recursive: true });
writeFileSync(OUTPUT, xml, 'utf8');
console.log(`${OUTPUT}: ${pages.length} pages, ${xml.length} bytes`);
for (const t of TABLES) {
  console.log(t.pbi, JSON.stringify(counts[t.pbi]));
}
