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
  'Machine Names EU|Product Type': ['assumed', 'Not in Insights Hub: the area is used (Bottles, Blisters), the same value as Area and Dept. Redundant until Reckitt gives the real mapping. Power BI local copy: Bottles / Blisters for Hull. Checked in the lake file of 2026-10-13: filled.'],
  'Machine Names EU|Unique Machine Name': ['assumed', 'Insights Hub = asset ID. Power BI local copy = machine-site text (Line 5-Weinheim). It is the hidden join key of every fact table. Decision open.'],
  'Machine Names EU|Dept': ['assumed', 'Insights Hub has no department: the area is used (same value as Area and Product Type). Power BI local copy: Liquids Pack / Dries Pack for Hull.'],
  'Machine Names EU|Area': ['assumed', 'Insights Hub area names (Bottles, Blisters), also used for Dept and Product Type. Power BI local copy: Liquids / Dries for Hull. Accepted for now.'],
  'Plan OPT EU|Unique Machine Name': ['assumed', 'Insights Hub = asset ID (see Machine Names EU). Power BI local copy: machine-site text. Decision open.'],
  'Plan OPT EU|AreaName': ['assumed', 'Insights Hub area names. The Power BI local copy has its own. Accepted.'],
  'Plan OPT EU|Date': ['assumed', 'Production day 06:00 to 06:00 UTC. Power BI local copy: calendar date. Not crucial: a window setting plus a backfill.'],
  'Plan OPT EU|ShiftName': ['assumed', 'Names come from the Insights Hub calendar (Blue, Red, Yellow, Gold, Green, Shift 1, Shift 2). Power BI local copy: crew colours and Day/Afternoon/Night. Accepted; each name must exist in Shift Naming.'],
  'Plan OPT EU|PartName': ['assumed', 'Product description, else name. Empty where no product was found for the day (B2 Line 1-3 and 8-14 Sep; GT4 29 Sep, 3 and 6-8 Oct).'],
  'Plan OPT EU|Product Key': ['assumed', 'Product code. Power BI local copy: machine + part name (join key to the product table). Decision: own product table, key still open.'],
  'Plan OPT EU|Good Parts': ['ok', 'Decimal (manual GT4 entries are spread over hours). Power BI local copy: whole numbers.'],
  'Plan OPT EU|Capacity': ['assumed', 'Assumption: design speed per minute x planned minutes. In the Power BI local copy the speed is constant for only 56% of machine/part pairs. Must be clarified.'],
  'Plan OPT EU|Downtime Units': ['assumed', 'Assumption: design speed per minute x downtime minutes.'],
  'Plan OPT EU|Total Time': ['assumed', 'Assumption: time with a shift planned (total time minus shift-plan stop). Power BI local copy: 720 or 480 per shift.'],
  'Plan OPT EU|Planned OpT': ['assumed', 'Assumption: operational time (total time minus planned stops).'],
  'Plan OPT EU|OEE Time': ['assumed', 'KPI used operational time. Power BI local copy: about good parts / design speed. Empty when Insights Hub has no product speed.'],
  'Plan OPT EU|OEE Target': ['file', 'Source: Glidepaths files (monthly target per machine). Needs the file integration. Same values as the report if the file is extracted and the key names match.'],
  'Plan OPT EU|PDT Target': ['file', 'Source: Glidepaths files (monthly target per machine). Needs the file integration. Same values as the report if the file is extracted and the key names match.'],
  'Plan OPT EU|UPDT Target': ['file', 'Source: Glidepaths files (monthly target per machine). Needs the file integration. Same values as the report if the file is extracted and the key names match.'],
  'Time Utilisation EU|Unique Machine Name': ['assumed', 'Insights Hub = asset ID (see Machine Names EU). Decision open.'],
  'Time Utilisation EU|Date': ['assumed', 'Follows the Plan OPT date (production day).'],
  'Time Utilisation EU|Total Time Total': ['assumed', 'Sum of Plan OPT Total Time per machine and day. Follows its assumption.'],
  'Time Utilisation EU|Planned OPT Total': ['assumed', 'Sum of Plan OPT Planned OpT per machine and day. Follows its assumption.'],
  'Time Utilisation EU|OEE Time Total': ['assumed', 'Sum of Plan OPT OEE Time per machine and day. Empty where there is no product speed.'],
  'Time Utilisation EU|All Time': ['ok', '1440 minutes per machine and day.'],
  'Daily Losses EU|Unique Machine Name': ['assumed', 'Insights Hub = asset ID (see Machine Names EU). Decision open.'],
  'Daily Losses EU|Date': ['assumed', 'Site local time (Europe/London only). Other sites and daylight saving still open.'],
  'Daily Losses EU|Time': ['assumed', 'Site local time (Europe/London only). Other sites and daylight saving still open.'],
  'Daily Losses EU|ShiftName': ['assumed', 'Names come from the Insights Hub calendar. Power BI local copy uses crew colours and Day/Afternoon/Night. Accepted.'],
  'Daily Losses EU|Duration': ['assumed', 'Decimal minutes. Power BI local copy: whole minutes. 14 long B2 stops had a duration shorter than their span (open point).'],
  'Daily Losses EU|Loss Units': ['assumed', 'Assumption: design speed per minute x stop minutes, no Volume Loss Correction. Empty where no product.'],
  'Daily Losses EU|OEELossLvl3Group': ['assumed', 'Rule: planned roots from Config = Planned Loss, default reason = Not Logged, rest = Unplanned Loss. Planned stops not verified in the API data.'],
  'Daily Losses EU|OEELossLvl3SubGroup': ['assumed', 'Stand-in from the reason tree level. Mapping of the B2 alarm stops needed from Reckitt.'],
  'Daily Losses EU|OEELossLvl3Desc': ['ok', 'Leaf reason text. To confirm it is what the report expects.'],
  'Daily Losses EU|Loss Final Level': ['ok', 'Leaf reason text. To confirm it is what the report expects.'],
  'Daily Losses EU|Equipment': ['assumed', 'B2: second reason level (Capper, Infeed ...). Power BI gets it from Equipment Coding files.'],
  'Daily Losses EU|Breakdown Types': ['assumed', 'Reason subgroup under Breakdown (Mechanical, Electrical). Needs the real reason tree.'],
  'Daily Losses EU|Batch ID': ['assumed', 'Order from the OEE order filter (decision 2026-10-12). Empty where no order was found.'],
  'Daily Losses EU|Comment': ['assumed', 'Power BI local copy: comment text. Insights Hub: comment count only (always 0 so far). Text not read.'],
  'Daily Losses EU|PartName': ['assumed', 'Product running at the stop (description, else name). Empty where no product was found.'],
  'Daily Losses EU|Product Key': ['assumed', 'Product code. Power BI local copy: machine + part name. Decision: own product table, key open.'],
  'Daily Losses EU|Loss Target Key': ['assumed', 'Insights Hub: machine|subgroup|month. Only useful once the Glidepaths targets exist.'],
  'Daily Losses EU|Value': ['file', 'Source: Glidepaths files (Targets Losses: monthly target per machine and loss subgroup). Needs the file integration. Same values as the report if the file is extracted and the key names match.'],
  'Daily Losses EU|Target': ['file', 'Value / 100. Follows Value.'],
  'Daily Losses EU|Volume Key': ['assumed', 'Insights Hub: machine|month. Joins to the volume targets, which are not available yet.'],
  'Daily Losses EU|Volume Total': ['empty', 'Good parts per machine and month on every loss row. Needs several days; not built.'],
  'Daily Losses EU|Merged': ['none', 'Power BI helper key for the Equipment Coding join. Not rebuilt.'],
  'Daily Losses EU|Volume Key.1': ['none', 'Duplicate of Volume Key. Not rebuilt.'],
  'Daily Losses EU|ShiftName - Copy': ['none', 'Copy of ShiftName made in Power Query. Not rebuilt.'],
  'Shift Naming EU|Shift': ['assumed', 'Names come from the Insights Hub calendars. Every shift name used in the facts must be in this table.'],
};

// Table notes shown at the top of each table page.
const TABLE_NOTE = {
  'Machine Names EU': 'Only the machines of the Config tab (Hull: 2). The Power BI local copy lists 76 machines of all sites.',
  'Plan OPT EU': 'One row per production day, machine, shift and product. Dates are text yyyy-mm-dd in the Insights Hub files (parquet has no date type).',
  'Time Utilisation EU': 'Sums of Plan OPT per machine and day. The Power BI local copy loads it from files.',
  'Daily Losses EU': 'One row per stop. Dates and times are text in the Insights Hub files.',
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
const typeName = (t) => t.replace(/\(.*\)/, '');

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
  file: ['#e1d5e7', '#9673a6'],
  none: ['#eeeeee', '#999999'],
  neutral: ['#ffffff', '#666666'],
  pbi: ['#dae8fc', '#6c8ebf'],
  ours: ['#f5f5f5', '#666666'],
};
const LABEL = {
  ok: 'OK',
  assumed: 'ASSUMPTION',
  empty: 'EMPTY NOW',
  file: 'NEEDS SOURCE FILE',
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

// Sample rows of the Power BI local copy (Plan OPT EU, Machine Names EU).
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
    let pending = false;
    if (note) {
      [level, text] = note;
      pending = note[2] === 'pending';
    } else if (map) {
      level = map[4] === 'Assumed' ? 'assumed' : map[4] === 'Missing' ? 'empty' : map[4] === 'Not needed' ? 'none' : 'ok';
      text = [map[6], map[7], map[8]].filter(Boolean).join('. ');
    }
    if (table.pbi === 'Calendar' && !note) {
      text = col.name === 'Date' ? 'Dates from the calendarStart and calendarEnd settings of the flow.' : 'Generated by the Insights Hub flow from the date (Monday week start).';
    }
    const share = our ? our.filled_share : null;
    let label = LABEL[level];
    let color = level;
    if (level === 'file') {
      color = 'file';
      label = LABEL.file;
      if (!our) {
        label += ' | NO COLUMN';
      } else if (share === 0) {
        label += ' | EMPTY NOW';
      } else if (share < FULL) {
        label += ` | PARTLY FILLED ${Math.round(share * 100)}%`;
      }
    } else if (level === 'none') {
      label = LABEL.none;
    } else if (!our) {
      color = 'empty';
      label = 'NO COLUMN IN OURS';
    } else if (share === 0 && pending) {
      color = 'assumed';
      label = 'FLOW CHANGED: EMPTY IN THE LAKE UNTIL THE FLOW RUNS AGAIN';
    } else if (share === 0) {
      color = 'empty';
      label = 'EMPTY NOW';
    } else if (share < FULL) {
      const pct = `PARTLY FILLED ${Math.round(share * 100)}%`;
      label = level === 'assumed' ? `ASSUMPTION + ${pct}` : pct;
      color = level === 'assumed' ? 'assumed' : 'partial';
    }
    if (level === 'empty' && share !== 0 && our && color !== 'file') {
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
  const c = { ok: 0, partial: 0, assumed: 0, empty: 0, file: 0, none: 0, gaps: 0 };
  for (const r of result.rows) {
    c[r.color] += 1;
    if (r.our && r.our.filled_share > 0 && r.our.filled_share < FULL) {
      c.gaps += 1;
    }
  }
  counts[t.pbi] = c;
}

const overview = new Page('Overview');
overview.text(40, 20, 1500, 30, bold('Power BI data overview: what the report reads and what is created from Insights Hub'), 'fontSize=18;');
overview.text(
  40,
  58,
  1500,
  60,
  'Source: the existing EU Power BI report (model template and report file, read 2026-10-12/13) and the Insights Hub Hull tables in the data lake (profile of 2026-10-13). ' +
    'The report also reads regional tables (N, H, W, M) directly on some pages; they are not in scope. Sheets 1 to 6 follow, one per table.',
  'fontSize=11;',
);
// Term used in all notes
overview.box(
  40,
  86,
  1500,
  26,
  bold('Power BI local copy') + esc(' = the existing EU report as a local Power BI file (model and sample tables). It is the reference for structure and examples; its values may be test data.'),
  'pbi',
  'fontSize=11;',
);
// Legend
const legend = [
  ['ok', 'OK: filled and built by a known rule'],
  ['partial', 'Partly filled: has gaps'],
  ['assumed', 'Assumption or difference: check it'],
  ['file', 'Needs source file: same values if the file is extracted'],
  ['empty', 'Empty now or no column: needs input'],
  ['none', 'Not needed'],
];
legend.forEach(([level, label], i) => {
  overview.box(40 + i * 250, 120, 240, 40, esc(label), level, 'fontSize=10.5;');
});

overview.text(40, 170, 1500, 24, bold('Tables created from Insights Hub today (6): the number is the number of its sheet'), 'fontSize=14;');
const CARD_W = 480;
const CARD_H = 330;
TABLES.forEach((t, i) => {
  const x = 40 + (i % 3) * (CARD_W + 30);
  const y = 205 + Math.floor(i / 3) * (CARD_H + 30);
  const s = summary.get(t.pbi === 'Calendar' ? 'Calendar' : t.pbi);
  const used = pagesOf(t.pbi);
  const c = counts[t.pbi];
  const prof = profile[t.ours];
  const total = c.ok + c.partial + c.assumed + c.empty + c.file + c.none;
  const lines = [
    bold(`${i + 1}  ${t.pbi}`) + `  ->  ${bold(t.shown)}`,
    esc(`Holds: ${s ? s[1] : ''}`),
    esc(`One row is: ${s ? s[2] : ''}`),
    esc(`Insights Hub table: ${prof.rows} rows, ${prof.columns.length} columns (Hull, downloaded 2026-10-13)`),
    esc(`Used on pages: ${used.ordered.length ? used.ordered.join(', ') : 'no visual reads it directly'}${used.viaMeasure ? ' (some through measures)' : ''}`),
    esc(`Columns in Power BI: ${total}`),
  ];
  // Border colour follows the worst column.
  const worst = c.empty > 0 ? 'empty' : c.file > 0 ? 'file' : c.assumed > 0 ? 'assumed' : c.partial > 0 ? 'partial' : 'ok';
  overview.box(x, y, CARD_W, CARD_H - 60, lines.join('<br><br>'), worst, 'verticalAlign=top;spacingTop=8;fillColor=#ffffff;strokeWidth=3;');
  const chips = [
    ['ok', `${c.ok} OK`],
    ['partial', `${c.gaps} with gaps`],
    ['assumed', `${c.assumed} assumption`],
    ['file', `${c.file} needs file`],
    ['empty', `${c.empty} empty / missing`],
    ['none', `${c.none} not needed`],
  ];
  chips.forEach(([level, label], j) => {
    overview.box(x + j * 78, y + CARD_H - 50, 74, 36, label, level, 'fontSize=10;align=center;spacingLeft=2;spacingRight=2;');
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
    bold('Machine key') + esc(': every fact table joins to Machine Names EU on Unique Machine Name (hidden key, never shown). Power BI local copy = machine-site text; Insights Hub = asset ID. Decision open.'),
    bold('Product key') + esc(': Plan OPT, Daily Losses and Run Rates join to the product master (Format List EU). Power BI local copy key = machine + part name; Insights Hub = product code. Own product table decided 2026-10-13.'),
    bold('Shift') + esc(': every fact table joins to Shift Naming EU on the shift name. All Insights Hub shift names must exist there.'),
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
  { pbi: 'Targets Losses EU', status: 'file', state: 'Needs file integration (Glidepaths)', what: 'Monthly loss target per machine and loss subgroup' },
  { pbi: 'OEE Targets EU', status: 'file', state: 'Needs file integration (Glidepaths)', what: 'Monthly OEE target per line' },
  { pbi: 'PDT Targets EU', status: 'file', state: 'Needs file integration (Glidepaths)', what: 'Monthly planned downtime target per line' },
  { pbi: 'UPDT Targets EU', status: 'file', state: 'Needs file integration (Glidepaths)', what: 'Monthly unplanned downtime target per line' },
  { pbi: 'Equipment Coding N', shown: 'Equipment Coding (N, H, W)', status: 'empty', hidden: true, state: 'Waits for Reckitt files', what: 'Maps a loss key to an equipment name' },
  { pbi: 'Volume Loss Correction N', shown: 'Volume Loss Correction (N, H, W)', status: 'empty', hidden: true, state: 'Waits for Reckitt files', what: 'Corrects loss units by machine, loss group and time (rule not known)' },
  { pbi: 'Targets Volume N', shown: 'Targets Volume (N, H, W, M)', status: 'empty', hidden: true, state: 'Waits for Reckitt files', what: 'Monthly good-parts volume per machine (weight for the targets)' },
];
const ncY = keysY + 190;
const shownN = NOT_CREATED.filter((t) => !t.hidden).length;
const hiddenN = NOT_CREATED.length - shownN;
const modelHidden = model.tables.filter((t) => t.hidden).length;
overview.text(40, ncY, 1500, 24, bold(`Power BI tables not created from Insights Hub yet: ${shownN} shown in the Data pane + ${hiddenN} hidden supporting tables (columns on the last page)`), 'fontSize=14;');
overview.text(
  40,
  ncY + 28,
  1500,
  36,
  `The Data pane of the Power BI local copy shows ${TABLES.length + shownN + 1} tables: the ${TABLES.length} above, the ${shownN} below and Measures Table (calculations only, no data). The model also has ${modelHidden} hidden staging tables (regional copies N, H, W, M, Provideam) that feed the EU tables. ${hiddenN} of them are listed here because they feed Daily Losses.`,
  'fontSize=11;',
);
NOT_CREATED.forEach((t, i) => {
  const x = 40 + (i % 4) * 375;
  const y = ncY + 84 + Math.floor(i / 4) * 190;
  const used = pagesOf(t.pbi);
  const mt = modelTable(t.pbi);
  const lines = [
    bold(t.shown ?? t.pbi),
    esc(t.what),
    esc(`${mt.columns.length} columns. Used on: ${used.ordered.length ? used.ordered.join(', ') : 'no visual reads it directly'}`),
    bold(t.state),
    t.hidden ? esc('Hidden table: not shown in the Data pane') : '',
  ].filter(Boolean);
  overview.box(x, y, 355, 170, lines.join('<br><br>'), t.status, 'verticalAlign=top;spacingTop=8;fontSize=10.5;');
});
pages.push(overview);

// ---- One page per table ------------------------------------------------------------------
const ROW = 90;
for (const t of TABLES) {
  const { rows, extras, prof } = compared.get(t.pbi);
  const s = summary.get(t.pbi);
  const used = pagesOf(t.pbi);
  const page = new Page(`${TABLES.indexOf(t) + 1} ${t.pbi}`);
  page.text(40, 20, 1500, 30, bold(`${t.pbi}  ->  ${t.shown}`), 'fontSize=18;');
  page.box(
    40,
    62,
    1260,
    96,
    [
      esc(`Holds: ${s ? s[1] : ''}. One row is: ${s ? s[2] : ''}.`),
      esc(`Insights Hub table: ${prof.rows} rows, ${prof.columns.length} columns. ${TABLE_NOTE[t.pbi] ?? ''}`),
      esc(`Used on pages: ${used.ordered.length ? used.ordered.join(', ') : 'no visual reads it directly'}${used.viaMeasure ? ' (some through measures)' : ''}`),
    ].join('<br>'),
    'neutral',
    'verticalAlign=top;spacingTop=6;fontSize=11;',
  );
  page.text(40, 172, 270, 20, bold('Power BI column') + ' (blue) and example (below it)', 'fontSize=11;');
  page.text(380, 172, 270, 20, bold('Insights Hub column') + ' and example (below it)', 'fontSize=11;');
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
      b = page.box(380, y, 280, 38, `${bold('(no column)')}<br>${small('not created from Insights Hub')}`, 'empty', 'dashed=1;');
    }
    page.edge(a, b, COLOR[r.color][1], !r.our);
    page.box(700, y, 600, 82, `${bold(r.label)}<br>${esc(r.text)}`, r.color, 'verticalAlign=top;spacingTop=4;fontSize=10.5;');
    y += ROW;
  }
  if (extras.length) {
    page.text(40, y + 6, 1260, 20, bold('Columns added from Insights Hub that the report does not have'), 'fontSize=11;');
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

// ---- Page: how the Glidepaths targets reach the report ------------------------------------
{
  const tp = new Page('Explanation Targets (Glidepaths)');
  const sub = profile.pbi_daily_losses.columns.find((c) => c.name === 'loss_lvl3_sub_group');
  tp.text(40, 20, 1500, 30, bold('Targets: from the Glidepaths files to the report visuals'), 'fontSize=18;');
  tp.box(
    40,
    62,
    1520,
    62,
    esc('Purple = needs the Glidepaths files (not connected yet). Blue = Power BI visual. The Glidepaths files fill 5 columns in 2 tables. Which visual uses which column comes from the data lineage document. No Glidepaths file has been seen yet: the file layout below comes from the load queries of the Power BI model.'),
    'neutral',
    'verticalAlign=top;spacingTop=6;fontSize=11;',
  );
  const head = (x, text) => tp.text(x, 140, 330, 20, bold(text), 'fontSize=12;');
  head(40, '1 Source files');
  head(430, '2 Target tables in the report');
  head(830, '3 Columns they fill');
  head(1230, '4 Visuals that use them');

  const src = tp.box(
    40,
    170,
    330,
    330,
    [
      bold('Glidepaths files'),
      esc('SharePoint, Nottingham site, one folder for all sites. One row per site, line and loss category (OEE Bucket). One column per month.'),
      bold('Columns (from the model query)'),
      esc('Site Name | Line | OEE Bucket | one column per month (value in percent)'),
      bold('Example row (layout only, not real values)'),
      esc('Hull | <line> | % OEE | 01/10/2026 = <percent>'),
      esc('The report turns the month columns into rows, then builds a key: <Line>-<Site> + category + month.'),
    ].join('<br><br>'),
    'file',
    'verticalAlign=top;spacingTop=6;fontSize=10.5;',
  );

  const tTables = [
    ['OEE Targets EU', 'Line, OEE Bucket, Attribute, OEE Target, Volume Key, Site Name', 'only the rows with bucket "% OEE"'],
    ['PDT Targets EU', 'Line, OEE Bucket, Attribute, PDT Target, Volume Key, Site Name', 'planned downtime target'],
    ['UPDT Targets EU', 'Line, OEE Bucket, Attribute, UPDT Target, Volume Key, % Target, Site Name', 'unplanned downtime target'],
    ['Targets Losses EU', 'Value, Loss Key, Volume Key', 'one target per machine, loss category and month'],
  ];
  const tableBoxes = tTables.map(([name, cols, note], i) => tp.box(
    430,
    170 + i * 84,
    330,
    74,
    bold(name) + '<br>' + esc(cols) + '<br>' + esc(note),
    'file',
    'verticalAlign=top;spacingTop=4;fontSize=10;',
  ));
  tableBoxes.forEach((id) => tp.edge(src, id, '#9673a6'));

  const col = (y, table, name, note) => tp.box(830, y, 330, 54, bold(table + ' [' + name + ']') + (note ? '<br>' + esc(note) : ''), 'file', 'verticalAlign=top;spacingTop=4;fontSize=10;');
  const cOee = col(170, 'Plan OPT EU', 'OEE Target', 'join: machine + month');
  const cPdt = col(236, 'Plan OPT EU', 'PDT Target', 'join: machine + month');
  const cUpdt = col(302, 'Plan OPT EU', 'UPDT Target', 'join: machine + month');
  const cVal = col(396, 'Daily Losses EU', 'Value', 'join: machine + loss sub group + month');
  const cTar = col(462, 'Daily Losses EU', 'Target', 'Value / 100');
  tp.edge(tableBoxes[0], cOee, '#9673a6');
  tp.edge(tableBoxes[1], cPdt, '#9673a6');
  tp.edge(tableBoxes[2], cUpdt, '#9673a6');
  tp.edge(tableBoxes[3], cVal, '#9673a6');
  tp.edge(cVal, cTar, '#9673a6');

  const vis = (y, text) => tp.box(1230, y, 330, 34, esc(text), 'pbi', 'fontSize=10.5;');
  const v1 = vis(170, '1 OEE % (Europe): gauge with target');
  const v4 = vis(210, '4 OEE % by Site');
  const v3 = vis(250, '3 Planned Loss %');
  const v7 = vis(290, '7 Planned Loss vs Target (%) and by Site');
  const v2 = vis(330, '2 Unplanned Loss %');
  const v8 = vis(370, '8 Unplanned Loss vs Target (%) and by Site');
  const v5 = vis(470, '5 Top 5 Loss Categories (also needs Volume Total)');
  tp.edge(cOee, v1, '#6c8ebf');
  tp.edge(cOee, v4, '#6c8ebf');
  tp.edge(cUpdt, v2, '#6c8ebf');
  tp.edge(cUpdt, v8, '#6c8ebf');
  tp.edge(cPdt, v3, '#6c8ebf');
  tp.edge(cPdt, v7, '#6c8ebf');
  tp.edge(cTar, v5, '#6c8ebf');
  tp.box(
    830,
    530,
    730,
    54,
    esc('Not from Glidepaths: Volume Total in Daily Losses comes from the Targets Volume table. For Hull that query reads the Plan OPT folder, so it can probably be added up from good parts. Visual 5 weights its target with it.'),
    'none',
    'fontSize=10.5;',
  );

  // How a stop finds its target.
  tp.text(40, 620, 1500, 24, bold('How one stop finds its target (Daily Losses): the texts must be equal'), 'fontSize=14;');
  const examples = sub.examples.join(' | ');
  const stop = tp.box(
    40,
    660,
    330,
    168,
    [
      bold('1 A stop in our Insights Hub data'),
      esc('Machine: B2 Line'),
      esc('Loss sub group: ' + sub.examples[1] + ' (our values: ' + examples + ')'),
      esc('Date: 2026-10-05'),
      esc(`Sub group is filled for ${Math.round(sub.filled_share * 100)}% of the stops only.`),
    ].join('<br>'),
    'ours',
    'verticalAlign=top;spacingTop=6;fontSize=10.5;',
  );
  const key1 = tp.box(
    430,
    660,
    330,
    168,
    [
      bold('2 The report builds a key'),
      esc('Loss Target Key = machine + loss sub group + month'),
      esc('B2 Line ' + sub.examples[1] + ' 01/10/2026'),
    ].join('<br><br>'),
    'pbi',
    'verticalAlign=top;spacingTop=6;fontSize=10.5;',
  );
  const key2 = tp.box(
    830,
    660,
    330,
    168,
    [
      bold('3 It looks for the same text in the file'),
      esc('Loss Key = <Line>-<Site> + OEE Bucket + month'),
      esc('Example (layout only): <line>-Hull <OEE Bucket> 01/10/2026'),
      esc('The category name comes from the file. We do not know it yet.'),
    ].join('<br><br>'),
    'file',
    'verticalAlign=top;spacingTop=6;fontSize=10.5;',
  );
  const good = tp.box(1230, 660, 330, 66, bold('Texts are equal') + '<br>' + esc('The stop gets Value and Target.'), 'ok', 'verticalAlign=top;spacingTop=6;fontSize=10.5;');
  const bad = tp.box(1230, 744, 330, 66, bold('Texts differ') + '<br>' + esc('Value and Target stay empty for this stop.'), 'empty', 'verticalAlign=top;spacingTop=6;fontSize=10.5;');
  tp.edge(stop, key1, '#666666');
  tp.edge(key1, key2, '#666666');
  tp.edge(key2, good, '#82b366');
  tp.edge(key2, bad, '#b85450', true);

  tp.box(
    40,
    850,
    1520,
    130,
    [
      bold('What can make the texts differ'),
      esc('1. Machine name: the file may write "B2 Auto" where Insights Hub says "B2 Line". Fix: a mapping of names.'),
      esc('2. Loss category name: our sub group is a stand-in (the top level of the reason tree). The file has its own category names. Fix: a mapping from our reason names to their categories.'),
      esc('3. Month text: the report writes the month as text (for example 01/10/2026). Both sides must use the same format.'),
      esc('Insights Hub numbers stay correct in all three cases. Only the target values stay empty.'),
    ].join('<br>'),
    'assumed',
    'verticalAlign=top;spacingTop=6;fontSize=10.5;',
  );
  pages.push(tp);
}

// ---- Page: Provideam and Insights Hub, overlap and replacement ---------------------------
{
  const pp = new Page('Explanation Provideam vs Insights Hub');
  pp.text(40, 20, 1500, 30, bold('Provideam and Insights Hub: what overlaps and what can replace what'), 'fontSize=18;');
  pp.box(
    40,
    62,
    1520,
    62,
    esc('Provideam = OEE monitoring software from the vendor DTL Systems (browser based: availability, performance, quality). The Hull site uses it as its production system. Source: the Hull maintenance guide (January 2026), its screenshots and vendor listings. Status 2026-10-13, Hull only. Provideam documentation was not read.'),
    'neutral',
    'verticalAlign=top;spacingTop=6;fontSize=11;',
  );

  // Two data paths.
  const chain = (y, label, steps, level) => {
    pp.text(40, y - 24, 700, 20, bold(label), 'fontSize=12;');
    const ids = steps.map(([text, lv], i) => pp.box(40 + i * 258, y, 235, 56, esc(text), lv || level, 'verticalAlign=middle;fontSize=10.5;'));
    for (let i = 0; i < ids.length - 1; i += 1) {
      pp.edge(ids[i], ids[i + 1], '#666666');
    }
  };
  chain(170, 'Provideam path (Hull today)', [
    ['Machines. Operators enter and edit data'],
    ['Provideam reports: daily, then hourly until 17:00'],
    ['CSV by email. Outlook rules sort the mails'],
    ['Power Automate saves one file per day'],
    ['SharePoint folder (Hull site)'],
    ['Power BI board: queries and 5 Excel files', 'pbi'],
  ], 'neutral');
  chain(280, 'Insights Hub path (VFC flows)', [
    ['Machines. OEE app and manual entries'],
    ['Insights Hub OEE API'],
    ['Insights Hub flows (VFC), run daily'],
    ['Data lake: parquet files'],
    ['6 Power BI tables (pbi_*) from Insights Hub'],
    ['Power BI board (target)', 'pbi'],
  ], 'ours');

  // Legend of this sheet.
  const legend2 = [
    ['assumed', 'Both systems have it: choose one official source'],
    ['empty', 'Only Provideam has it: Insights Hub cannot replace it yet'],
    ['ok', 'Only Insights Hub has it (the report does not use it)'],
    ['partial', 'Independent of both: Excel files kept by the site'],
  ];
  legend2.forEach(([level, text], i) => pp.box(40 + i * 385, 340, 370, 36, esc(text), level, 'fontSize=10.5;'));

  // Overlap table.
  const header = (x, w, text) => pp.text(x, 392, w, 20, bold(text), 'fontSize=12;');
  header(40, 330, 'Item');
  header(390, 400, 'Provideam');
  header(810, 400, 'Insights Hub');
  header(1230, 330, 'Result');
  const rows = [
    ['Good parts and rejects by machine, shift, product', 'Plan OPT report: Good Parts, Defect Parts', 'fact_kpi: good_parts, rejected_parts', 'assumed', 'Both: choose one source'],
    ['OEE, availability, performance, quality', 'Plan OPT: OEE = Good Parts / Capacity. Performance Availability report', 'fact_kpi: oee, availability, performance, quality (same formula if speed and planned time are equal)', 'assumed', 'Both: choose one source'],
    ['Capacity', 'Plan OPT: Capacity (rated speed x planned time)', 'Assumption in the flow: design speed x planned time. Not confirmed', 'assumed', 'Both: rule differs'],
    ['Planned time and planned stops', 'Planned OpT. Loss groups Planned Loss, Production not scheduled', 'Shift calendar and planned stop times', 'assumed', 'Both: planned time differs'],
    ['Stops with reason tree and duration', 'Mode Log: Group, SubGroup, Desc, Duration', 'fact_loss: reason path, duration', 'assumed', 'Both: reason names differ'],
    ['Product and speed', 'PartName and rated speed in the reports', 'Product (collection) and design speed', 'assumed', 'Both: names and speed differ'],
    ['Shift names', 'ShiftName, for example FriDay - Blue', 'Calendar event names', 'assumed', 'Both: names differ'],
    ['Machine list and area', 'Machine IDs, AreaName', 'Asset hierarchy (site, area, line)', 'assumed', 'Both: names differ'],
    ['Loss Units (loss in product units)', 'OEE Loss report: Loss Units', 'Not available. Assumption: speed x duration', 'empty', 'Only Provideam'],
    ['Comment text of a stop', 'Mode Log: Comment', 'Comment count only', 'empty', 'Only Provideam'],
    ['Run segments (time while running)', 'Mode Log: rows with group Run', 'Not in fact_loss (stops only)', 'empty', 'Only Provideam'],
    ['MTTR, MTBF, TEEP, micro and macro stops', 'Not seen in the reports', 'fact_kpi columns', 'ok', 'Only Insights Hub'],
    ['Targets (Glidepaths), Machine Names, Equipment Coding, Shift Pattern Naming, Format Mapping', 'Excel files kept by the site. Not made by Provideam', 'Not available', 'partial', 'Independent of both'],
  ];
  rows.forEach(([item, prov, sih, level, result], i) => {
    const y = 420 + i * 46;
    pp.box(40, y, 330, 40, esc(item), level, 'fontSize=10.5;');
    pp.box(390, y, 400, 40, esc(prov), level, 'fontSize=10.5;');
    pp.box(810, y, 400, 40, esc(sih), level, 'fontSize=10.5;');
    pp.box(1230, y, 330, 40, bold(result), level, 'fontSize=10.5;');
  });

  // What it means.
  const endY = 420 + rows.length * 46 + 20;
  pp.text(40, endY, 1500, 24, bold('What this means for replacing Provideam'), 'fontSize=14;');
  pp.box(
    40,
    endY + 34,
    1520,
    150,
    [
      esc('1. Overlap rows: Insights Hub can supply the data, but the numbers differ. On the overlap days the Insights Hub good parts are 96.6% (B2) and 43.6% (GT4) of the Provideam good parts. Reckitt must name the official source per site.'),
      esc('2. Only Provideam: we need the Provideam files or the Provideam rules. Or Reckitt accepts that the column is empty (for example comment text).'),
      esc('3. Excel files: they do not depend on the OEE source. We need them in every case.'),
      esc('4. At a switch, the history in the report changes: Provideam numbers before the date, Insights Hub numbers after it.'),
    ].join('<br><br>'),
    'neutral',
    'verticalAlign=top;spacingTop=8;fontSize=11;',
  );
  pages.push(pp);
}

// ---- Page for the tables not created -----------------------------------------------------------
const nc = new Page('Not created yet');
nc.text(40, 20, 1500, 30, bold('Power BI tables not created from Insights Hub yet'), 'fontSize=18;');
nc.text(
  40,
  58,
  1500,
  44,
  'Columns are those of the Power BI model. The status says what the table needs. Group 2 = shift KPIs, run rate (decide later); group 3 = Glidepaths targets (needs file integration) and correction files (waits for Reckitt). Not analysed in the model: Handover, Shift Colours, Master Mode Comment and Full Site Shift Performance are read by visuals but are not tables of the template.',
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
    t.hidden ? esc('Hidden table: not shown in the Data pane') : '',
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
