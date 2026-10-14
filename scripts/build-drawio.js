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
const OUTPUT = process.env.DRAWIO_OUT || 'diagrams/powerbi-data-map.drawio';
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
  'Machine Names EU|Product Type': ['assumed', 'Stand-in: the Insights Hub area. Real source: the Machine Names file of the site (columns MachineName, Dept, Area, Product Type). The Hull file is not downloaded (no access); Nottingham (66 rows) and Weinheim (6 rows) were checked. Local copy sample: Bottles / Blisters for Hull. See the sheet Explanation Machine Names.'],
  'Machine Names EU|Unique Machine Name': ['assumed', 'Insights Hub = asset ID. Power BI local copy = machine-site text (Line 5-Weinheim). It is the hidden join key of every fact table. Decision open.'],
  'Machine Names EU|Dept': ['assumed', 'Stand-in: the Insights Hub area. Real source: the Machine Names file (local copy sample: Liquids Pack / Dries Pack for Hull). Hull file not downloaded. See the sheet Explanation Machine Names.'],
  'Machine Names EU|Area': ['assumed', 'Stand-in: the Insights Hub area (Bottles, Blisters). Real source: the Machine Names file (local copy sample: Liquids / Dries for Hull). Hull file not downloaded. See the sheet Explanation Machine Names.'],
  'Plan OPT EU|Unique Machine Name': ['assumed', 'Insights Hub = asset ID (see Machine Names EU). Power BI local copy: machine-site text. Decision open.'],
  'Plan OPT EU|AreaName': ['assumed', 'Insights Hub area names. The Power BI local copy has its own. Accepted.'],
  'Plan OPT EU|Date': ['assumed', 'Production day 06:00 to 06:00 UTC. Power BI local copy: calendar date. Not crucial: a window setting plus a backfill.'],
  'Plan OPT EU|ShiftName': ['assumed', 'The report keeps the mapped Shift value (Afternoon, Blue, Day, Gold, Green, Night, Red), not the raw Provideam name. Insights Hub calendar names Blue, Gold, Green, Red match; Yellow, Shift 1 and Shift 2 do not (mapping needed). See the sheet Explanation Shift names.'],
  'Plan OPT EU|PartName': ['assumed', 'Product description, else name. Empty where no product was found for the day. Format List (Hull) check: GT4 13 of 13 names match, B2 Line 0 of 27 (SAP-style descriptions against short Provideam names). See the sheet Explanation Format List.'],
  'Plan OPT EU|Product Key': ['assumed', 'Insights Hub: product code. The report: machine name + site + part name, the key to the Format List. Same texts needed: GT4 matches, B2 does not (names differ). Decision: own product table, key still open. See the sheet Explanation Format List.'],
  'Plan OPT EU|Good Parts': ['ok', 'Decimal (manual GT4 entries are spread over hours). Power BI local copy: whole numbers.'],
  'Plan OPT EU|Capacity': ['assumed', 'Assumption: design speed per minute x planned minutes. In the Power BI local copy the speed is constant for only 56% of machine/part pairs. Must be clarified.'],
  'Plan OPT EU|Downtime Units': ['assumed', 'Assumption: design speed per minute x downtime minutes.'],
  'Plan OPT EU|Total Time': ['assumed', 'Assumption: time with a shift planned (total time minus shift-plan stop). Power BI local copy: 720 or 480 per shift.'],
  'Plan OPT EU|Planned OpT': ['assumed', 'Assumption: operational time (total time minus planned stops).'],
  'Plan OPT EU|OEE Time': ['assumed', 'KPI used operational time. Power BI local copy: about good parts / design speed. Empty when Insights Hub has no product speed.'],
  'Plan OPT EU|OEE Target': ['file', 'Source: Glidepaths file. Hull file checked 2026-10-14. 30 lines, 17 buckets, 2026 is 91% filled, 2027 and 2028 are empty. Same values as the report if the file is extracted and the line names match (B2 Auto = B2 Line needs a mapping). See the sheet Explanation Targets.'],
  'Plan OPT EU|PDT Target': ['file', 'Source: Glidepaths file. Hull file checked 2026-10-14. 30 lines, 17 buckets, 2026 is 91% filled, 2027 and 2028 are empty. Same values as the report if the file is extracted and the line names match (B2 Auto = B2 Line needs a mapping). See the sheet Explanation Targets.'],
  'Plan OPT EU|UPDT Target': ['file', 'Source: Glidepaths file. Hull file checked 2026-10-14. 30 lines, 17 buckets, 2026 is 91% filled, 2027 and 2028 are empty. Same values as the report if the file is extracted and the line names match (B2 Auto = B2 Line needs a mapping). See the sheet Explanation Targets.'],
  'Time Utilisation EU|Unique Machine Name': ['assumed', 'Insights Hub = asset ID (see Machine Names EU). Decision open.'],
  'Time Utilisation EU|Date': ['assumed', 'Follows the Plan OPT date (production day).'],
  'Time Utilisation EU|Total Time Total': ['assumed', 'Sum of Plan OPT Total Time per machine and day. Follows its assumption.'],
  'Time Utilisation EU|Planned OPT Total': ['assumed', 'Sum of Plan OPT Planned OpT per machine and day. Follows its assumption.'],
  'Time Utilisation EU|OEE Time Total': ['assumed', 'Sum of Plan OPT OEE Time per machine and day. Empty where there is no product speed.'],
  'Time Utilisation EU|All Time': ['ok', '1440 minutes per machine and day.'],
  'Daily Losses EU|Unique Machine Name': ['assumed', 'Insights Hub = asset ID (see Machine Names EU). Decision open.'],
  'Daily Losses EU|Date': ['assumed', 'Site local time (Europe/London only). Other sites and daylight saving still open.'],
  'Daily Losses EU|Time': ['assumed', 'Site local time (Europe/London only). Other sites and daylight saving still open.'],
  'Daily Losses EU|ShiftName': ['assumed', 'Same as Plan OPT: the report keeps the mapped Shift value. Insights Hub names Yellow, Shift 1 and Shift 2 are not in the list. See the sheet Explanation Shift names.'],
  'Daily Losses EU|Duration': ['assumed', 'Decimal minutes. Power BI local copy: whole minutes. 14 long B2 stops had a duration shorter than their span (open point).'],
  'Daily Losses EU|Loss Units': ['assumed', 'Assumption: design speed x duration. The rule is the same as in the Provideam files: loss units per minute = capacity per planned minute (Nottingham: 2,341 of 2,349 machine-days within 3%). The report reads the units from the Volume Loss Correction file. See the sheet Explanation Loss Units.'],
  'Daily Losses EU|OEELossLvl3Group': ['assumed', 'Rule: planned roots from Config = Planned Loss, default reason = Not Logged, rest = Unplanned Loss. Planned stops not verified in the API data.'],
  'Daily Losses EU|OEELossLvl3SubGroup': ['assumed', 'Stand-in: the top reason level. The report makes Provideam names equal to the glidepath buckets with 17 text rules (Hull query). Only 22 of 10,100 Insights Hub stops have a name that equals a bucket. See the sheet Explanation Targets.'],
  'Daily Losses EU|OEELossLvl3Desc': ['ok', 'Leaf reason text. To confirm it is what the report expects.'],
  'Daily Losses EU|Loss Final Level': ['ok', 'Leaf reason text. To confirm it is what the report expects.'],
  'Daily Losses EU|Equipment': ['assumed', 'Stand-in: second reason level (B2: Capper, Infeed ...). Real source: the Equipment Coding file (key = machine + loss description). Hull file not downloaded. Checked on Nottingham (98% of the unplanned stops have an entry) and Weinheim (70%). See the sheet Explanation Equipment Coding.'],
  'Daily Losses EU|Breakdown Types': ['assumed', 'Reason subgroup under Breakdown (Mechanical, Electrical). Needs the real reason tree.'],
  'Daily Losses EU|Batch ID': ['assumed', 'Order from the OEE order filter (decision 2026-10-12). Empty where no order was found.'],
  'Daily Losses EU|Comment': ['assumed', 'The Provideam Mode Log has the comment text: filled for 63% of the Nottingham stop rows and 4% of Weinheim. Insights Hub: comment count only (the text endpoint returned no records).'],
  'Daily Losses EU|PartName': ['assumed', 'Product running at the stop (description, else name). Empty where no product was found.'],
  'Daily Losses EU|Product Key': ['assumed', 'Insights Hub: product code. The report: machine name + site + part name (key to the Format List). B2 names differ from the file. See the sheet Explanation Format List.'],
  'Daily Losses EU|Loss Target Key': ['assumed', 'Insights Hub: machine|subgroup|month. Only useful once the Glidepaths targets exist.'],
  'Daily Losses EU|Value': ['file', 'Source: Glidepaths file (one value per line, loss bucket and month; 17 buckets). Hull file checked 2026-10-14. Needs a mapping from the loss names to the buckets: only 22 of 10,100 Insights Hub stops have a sub group that equals a bucket. See the sheet Explanation Targets.'],
  'Daily Losses EU|Target': ['file', 'Value / 100. Follows Value.'],
  'Daily Losses EU|Volume Key': ['assumed', 'Insights Hub: machine|month. Joins to the volume targets, which are not available yet.'],
  'Daily Losses EU|Volume Total': ['assumed', 'Corrected 2026-10-14: the Hull query sums Capacity per machine and DAY from the Plan OPT files (not good parts per month). Insights Hub can build it from its own Plan OPT Capacity. Not built yet. It follows the capacity assumption.'],
  'Daily Losses EU|Merged': ['none', 'Power BI helper key for the Equipment Coding join. Not rebuilt.'],
  'Daily Losses EU|Volume Key.1': ['none', 'Duplicate of Volume Key. Not rebuilt.'],
  'Daily Losses EU|ShiftName - Copy': ['none', 'Copy of ShiftName made in Power Query. Not rebuilt.'],
  'Shift Naming EU|Shift': ['file', 'Source: Shift Pattern file, one for all sites (188 raw names to 7 values: Afternoon, Blue, Day, Gold, Green, Night, Red). Checked 2026-10-14: all 105 Hull raw names are covered. Same list if extracted. Insights Hub names Yellow, Shift 1 and Shift 2 are not in the list. See the sheet Explanation Shift names.'],
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

// ---- Insights Hub (SIH) source of every column ------------------------------------------------
// Paths are shown without the service suffix. Target platform: xcelerator (host api.eu1.siemens.app,
// service name with the suffix -1000001700). Legacy: gateway.eu1.mindsphere.io (docs/platform-switch.md).
const EP = {
  assets: 'GET /api/oee/v3/assets',
  am: 'GET /api/assetmanagement/v3/assets/{assetId}',
  config: 'GET /api/oee/v3/assets/{assetId}/config',
  cal: 'GET /api/oee/v3/calendars/{calendarId}/calendarEvents',
  kpi: 'POST /api/oee/v3/expressions/evaluateKPIs',
  filter: 'GET /api/oee/v3/assets/{assetId}/filterValues',
  prod: 'GET /api/oee/v3/productCollections/{collectionId}/products',
  down: 'GET /api/oee/v3/assets/{assetId}/downtimeReasons',
};
const NO_SRC = 'No Insights Hub source. Comes from a file (see the status above).';
const FROM_AM = (level) => `${EP.am} -> hierarchyPath, ${level}`;
const SIH_SRC = {
  'Machine Names EU|MachineName': `${EP.am} -> asset name (line level)`,
  'Machine Names EU|Dept': `${FROM_AM('area level')}. Stand-in: Insights Hub has no department`,
  'Machine Names EU|Area': FROM_AM('area level'),
  'Machine Names EU|Product Type': `${FROM_AM('area level')}. Stand-in: Insights Hub has no product type`,
  'Machine Names EU|SiteName': FROM_AM('site level'),
  'Machine Names EU|Unique Machine Name': `${EP.assets} -> assetId`,
  'Plan OPT EU|Date': `No endpoint: the production day (06:00 to 06:00 UTC) is set in the flow. Hours come from ${EP.kpi}`,
  'Plan OPT EU|AreaName': FROM_AM('area level'),
  'Plan OPT EU|MachineName': `${EP.am} -> asset name`,
  'Plan OPT EU|ShiftName': `${EP.cal} -> event name and recurrence. The calendarId comes from ${EP.config}`,
  'Plan OPT EU|PartName': `${EP.filter} -> product names, then ${EP.prod} -> description`,
  'Plan OPT EU|Good Parts': `${EP.kpi}, hourly, KPI "Good parts" (one call per product)`,
  'Plan OPT EU|Capacity': `${EP.prod} -> design speed, multiplied by KPI "Operational time" of ${EP.kpi}`,
  'Plan OPT EU|Downtime Units': `${EP.prod} -> design speed, multiplied by KPI "Downtime (duration)" of ${EP.kpi}`,
  'Plan OPT EU|Total Time': `${EP.kpi}: KPI "Total time" minus KPI "Planned stop from shift plan"`,
  'Plan OPT EU|Planned OpT': `${EP.kpi}: KPI "Operational time"`,
  'Plan OPT EU|OEE Time': `${EP.kpi}: KPI "Used operational time"`,
  'Plan OPT EU|OEE Target': NO_SRC,
  'Plan OPT EU|PDT Target': NO_SRC,
  'Plan OPT EU|UPDT Target': NO_SRC,
  'Plan OPT EU|SiteName': FROM_AM('site level'),
  'Plan OPT EU|Unique Machine Name': `${EP.assets} -> assetId`,
  'Plan OPT EU|Product Key': `${EP.filter} -> product names, then ${EP.prod} -> code`,
  'Time Utilisation EU|SiteName': FROM_AM('site level'),
  'Time Utilisation EU|MachineName': `${EP.am} -> asset name`,
  'Time Utilisation EU|Unique Machine Name': `${EP.assets} -> assetId`,
  'Time Utilisation EU|Date': 'No endpoint: sum of the Plan OPT rows per machine and day',
  'Time Utilisation EU|Total Time Total': `Sum of Plan OPT Total Time (${EP.kpi})`,
  'Time Utilisation EU|Planned OPT Total': `Sum of Plan OPT Planned OpT (${EP.kpi})`,
  'Time Utilisation EU|OEE Time Total': `Sum of Plan OPT OEE Time (${EP.kpi})`,
  'Time Utilisation EU|All Time': 'No endpoint: 1,440 minutes per day, a constant in the flow',
  'Daily Losses EU|SiteName': FROM_AM('site level'),
  'Daily Losses EU|MachineName': `${EP.am} -> asset name`,
  'Daily Losses EU|Unique Machine Name': `${EP.assets} -> assetId`,
  'Daily Losses EU|Date': `${EP.down} -> from (start of the stop), changed to local time`,
  'Daily Losses EU|Time': `${EP.down} -> from (start of the stop), changed to local time`,
  'Daily Losses EU|ShiftStartDate': 'No endpoint: the production day set in the flow',
  'Daily Losses EU|ShiftName': `${EP.cal} -> event of the stop start. The calendarId comes from ${EP.config}`,
  'Daily Losses EU|Duration': `${EP.down} -> duration (ms), changed to minutes`,
  'Daily Losses EU|Loss Units': `${EP.prod} -> design speed, multiplied by duration of ${EP.down}`,
  'Daily Losses EU|OEELossLvl3Group': `${EP.down} -> reasonFullPath (top level) and the planned roots of the Config tab`,
  'Daily Losses EU|OEELossLvl3SubGroup': `${EP.down} -> reasonFullPath (top level). Stand-in`,
  'Daily Losses EU|OEELossLvl3Desc': `${EP.down} -> reason (leaf)`,
  'Daily Losses EU|Loss Final Level': `${EP.down} -> reason (leaf)`,
  'Daily Losses EU|Equipment': `${EP.down} -> reasonFullPath (second level)`,
  'Daily Losses EU|Breakdown Types': `${EP.down} -> reasonFullPath (second level under Breakdown)`,
  'Daily Losses EU|Batch ID': `${EP.filter} -> order numbers, with ${EP.kpi} filter ORDER (order of the hour of the stop)`,
  'Daily Losses EU|Comment': `${EP.down} -> commentCount (count only; the text endpoint /assets/{assetId}/comment returned no records)`,
  'Daily Losses EU|PartName': `Product of the hour of the stop: ${EP.filter}, ${EP.kpi} filter PRODUCT, ${EP.prod}`,
  'Daily Losses EU|Product Key': `Product of the hour of the stop: ${EP.filter}, ${EP.kpi} filter PRODUCT, ${EP.prod} -> code`,
  'Daily Losses EU|Loss Target Key': 'No endpoint: built in the flow from the line name, the loss category and the month',
  'Daily Losses EU|Value': NO_SRC,
  'Daily Losses EU|Target': NO_SRC,
  'Daily Losses EU|Volume Key': 'No endpoint: built in the flow from the line name and the month',
  'Daily Losses EU|Volume Total': 'No endpoint: sum of the Plan OPT Capacity per machine and day, built in the flow (not built yet)',
  'Shift Naming EU|Shift': `${EP.cal} -> distinct event names. The calendarId comes from ${EP.config}`,
};
const sihSource = (table, column, color) => {
  if (table === 'Calendar') {
    return 'No endpoint: generated in the flow from calendarStart and calendarEnd (settings)';
  }
  if (SIH_SRC[`${table}|${column}`]) {
    return SIH_SRC[`${table}|${column}`];
  }
  return color === 'none' ? 'Not needed. Power BI helper column' : 'Not mapped';
};
const TABLE_ENDPOINTS = {
  'Machine Names EU': 'OEE /assets, Asset Management /assets/{assetId}',
  'Plan OPT EU': 'OEE evaluateKPIs (hourly, filter PRODUCT), filterValues, productCollections/{id}/products, calendars/{id}/calendarEvents, assets/{id}/config; Asset Management /assets/{assetId}',
  'Time Utilisation EU': 'Same as Plan OPT EU (sums per machine and day)',
  'Daily Losses EU': 'OEE downtimeReasons, evaluateKPIs (filter PRODUCT and ORDER), filterValues, productCollections/{id}/products, calendarEvents, assets/{id}/config; Asset Management /assets/{assetId}',
  'Shift Naming EU': 'OEE assets/{id}/config, calendars/{id}/calendarEvents',
  Calendar: 'None: generated in the flow',
};
const NC_SIH = {
  'Run Rates EU': 'possible: evaluateKPIs hourly (KPI "Good parts") and the design speed',
  'Volume CoV EU': 'possible: evaluateKPIs per shift',
  'Format List EU': 'productCollections/{id}/products (name, code, description, design speed). Brand, size and count: none',
  'Targets Losses EU': 'none (Glidepaths file)',
  'OEE Targets EU': 'none (Glidepaths file)',
  'PDT Targets EU': 'none (Glidepaths file)',
  'UPDT Targets EU': 'none (Glidepaths file)',
  'Equipment Coding N': 'none. The reason names are in /reasontrees/{id}/reasons',
  'Volume Loss Correction N': 'none (Insights Hub has no loss units). Rule: stop minutes x capacity per minute',
  'Targets Volume N': 'built in the flow: sum of the Plan OPT Capacity per machine and day',
};
const COLOR_SIH = ['#d5efee', '#3c9a96'];

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
  sih: ['#d5efee', '#3c9a96'],
  sihSrc: ['#26C6B8', '#00897B'],
  sihNone: ['#90A4AE', '#546E7A'],
  sihFlow: ['#7986CB', '#3949AB'],
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

  edge(source, target, color = '#555555', dashed = false, label = '') {
    const id = this.id();
    const style = `edgeStyle=orthogonalEdgeStyle;html=1;endArrow=block;endFill=1;strokeWidth=1.5;strokeColor=${color};${dashed ? 'dashed=1;' : ''}${label ? 'fontSize=10;labelBackgroundColor=#ffffff;' : ''}`;
    this.cells.push(
      `<mxCell id="${id}" value="${esc(label)}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
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
const CARD_H = 410;
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
    bold('Insights Hub endpoints: ') + esc(TABLE_ENDPOINTS[t.pbi] ?? ''),
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
  175,
  [
    bold('Machine key') + esc(': every fact table joins to Machine Names EU on Unique Machine Name (hidden key, never shown). Power BI local copy = machine-site text; Insights Hub = asset ID. Decision open.'),
    bold('Product key') + esc(': Plan OPT, Daily Losses and Run Rates join to the product master (Format List EU). Power BI local copy key = machine + part name; Insights Hub = product code. Own product table decided 2026-10-13.'),
    bold('Shift') + esc(': every fact table joins to Shift Naming EU on the shift name. All Insights Hub shift names must exist there.'),
    bold('Date') + esc(': every fact table joins to Calendar on the date (Daily Losses: on the shift start date).'),
    bold('Endpoints') + esc(': the paths are shown without the Xcelerator service suffix. Target platform (xcelerator, from 2026-10-13): host api.eu1.siemens.app and the service name gets the suffix -1000001700, for example /api/oee-1000001700/v3/... Legacy: host gateway.eu1.mindsphere.io, no suffix (docs/platform-switch.md).'),
  ].join('<br><br>'),
  'neutral',
  'verticalAlign=top;spacingTop=8;',
);

// Not created: short cards
const NOT_CREATED = [
  { pbi: 'Run Rates EU', status: 'none', state: 'Decide later (group 2)', what: 'Good parts and capacity per machine, shift and product' },
  { pbi: 'Volume CoV EU', status: 'none', state: 'Decide later (group 2)', what: 'Per shift and machine: good parts sum and capacity max (volume variation)' },
  { pbi: 'Format List EU', status: 'file', state: 'Needs file integration (Format Mapping files)', what: 'Product master: brand, unit size, unit count per machine and product', note: 'Hull file checked: 286 rows. GT4 names match the Insights Hub names, B2 names differ' },
  { pbi: 'Targets Losses EU', status: 'file', state: 'Needs file integration (Glidepaths)', what: 'Monthly loss target per machine and loss subgroup' },
  { pbi: 'OEE Targets EU', status: 'file', state: 'Needs file integration (Glidepaths)', what: 'Monthly OEE target per line' },
  { pbi: 'PDT Targets EU', status: 'file', state: 'Needs file integration (Glidepaths)', what: 'Monthly planned downtime target per line' },
  { pbi: 'UPDT Targets EU', status: 'file', state: 'Needs file integration (Glidepaths)', what: 'Monthly unplanned downtime target per line' },
  { pbi: 'Equipment Coding N', shown: 'Equipment Coding (N, H, W)', status: 'file', hidden: true, state: 'Needs file integration (Hull file not downloaded)', what: 'Maps a machine and loss description to an equipment name' },
  { pbi: 'Volume Loss Correction N', shown: 'Volume Loss Correction (N, H, W)', status: 'file', hidden: true, state: 'Needs file integration (Provideam report; Hull file not downloaded)', what: 'Loss units per day, machine and loss reason (Provideam OEE Loss report)' },
  { pbi: 'Targets Volume N', shown: 'Targets Volume (N, H, W, M)', status: 'assumed', hidden: true, state: 'Built from the Plan OPT Capacity per machine and day (not a file)', what: 'Capacity per machine and day (weight for the loss targets)' },
];
const ncY = keysY + 245;
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
  const y = ncY + 84 + Math.floor(i / 4) * 250;
  const used = pagesOf(t.pbi);
  const mt = modelTable(t.pbi);
  const lines = [
    bold(t.shown ?? t.pbi),
    esc(t.what),
    esc(`${mt.columns.length} columns. Used on: ${used.ordered.length ? used.ordered.join(', ') : 'no visual reads it directly'}`),
    bold(t.state),
    esc('SIH source: ' + (NC_SIH[t.pbi] ?? 'none')),
    t.hidden ? esc('Hidden table: not shown in the Data pane') : '',
  ].filter(Boolean);
  overview.box(x, y, 355, 230, lines.join('<br><br>'), t.status, 'verticalAlign=top;spacingTop=8;fontSize=10.5;');
});
// Priority of all 16 tables (6 created, 10 not created yet), panel on the right of the overview.
{
  const PX = 1600;
  const colPages = (table, cols) => {
    const set = new Set();
    cols.forEach((c) => (usage.columnPages.get(`${table}|${c}`) ?? []).forEach((p) => set.add(p)));
    // pages that show a measure whose formula reads the column
    model.tables.forEach((mt) => mt.measures.forEach((m) => {
      if (cols.some((c) => m.expression.includes(`'${table}'[${c}]`))) {
        (usage.columnPages.get(`${mt.name}|${m.name}`) ?? []).forEach((p) => set.add(p));
      }
    }));
    return set.size;
  };
  // visuals = visuals of the EU-Level Overview page (Segun lineage) that depend on the table, directly or
  // through the column it fills. pages = report pages that read it (Power BI file).
  const all = [
    { name: 'Machine Names EU', visuals: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15], pages: pagesOf('Machine Names EU').ordered.length, state: 'Created. Insights Hub data complete', level: 'ok' },
    { name: 'Plan OPT EU', visuals: [1, 2, 3, 4, 5, 7, 8, 9, 10], pages: pagesOf('Plan OPT EU').ordered.length, state: 'Created. Targets missing', level: 'assumed' },
    { name: 'Daily Losses EU', visuals: [2, 3, 5, 7, 8, 9], pages: pagesOf('Daily Losses EU').ordered.length, state: 'Created. Loss names to map', level: 'assumed' },
    { name: 'Volume Loss Correction (feeds Loss Units)', visuals: [2, 3, 5, 7, 8, 9], pages: colPages('Daily Losses EU', ['Loss Units']), state: 'Not created. Needs file or rule', level: 'file' },
    { name: 'OEE Targets EU (feeds OEE Target)', visuals: [1, 4], pages: colPages('Plan OPT EU', ['OEE Target']), state: 'Not created. Needs Glidepaths', level: 'file' },
    { name: 'PDT Targets EU (feeds PDT Target)', visuals: [3, 7], pages: colPages('Plan OPT EU', ['PDT Target']), state: 'Not created. Needs Glidepaths', level: 'file' },
    { name: 'UPDT Targets EU (feeds UPDT Target)', visuals: [2, 8], pages: colPages('Plan OPT EU', ['UPDT Target']), state: 'Not created. Needs Glidepaths', level: 'file' },
    { name: 'Calendar', visuals: [5, 13], pages: pagesOf('Calendar').ordered.length, state: 'Created. Done', level: 'ok' },
    { name: 'Targets Losses EU (feeds Value, Target)', visuals: [5], pages: colPages('Daily Losses EU', ['Value', 'Target']), state: 'Not created. Needs Glidepaths', level: 'file' },
    { name: 'Targets Volume (feeds Volume Total)', visuals: [5], pages: colPages('Daily Losses EU', ['Volume Total']), state: 'Not created. Build from Plan OPT', level: 'assumed' },
    { name: 'Shift Naming EU', visuals: [16], pages: pagesOf('Shift Naming EU').ordered.length, state: 'Created. Mapping needed', level: 'assumed' },
    { name: 'Time Utilisation EU', visuals: [6], pages: pagesOf('Time Utilisation EU').ordered.length, state: 'Created. Follows Plan OPT', level: 'assumed' },
    { name: 'Format List EU', visuals: [], pages: pagesOf('Format List EU').ordered.length, state: 'Not created. Needs file', level: 'file' },
    { name: 'Equipment Coding (feeds Equipment)', visuals: [], pages: colPages('Daily Losses EU', ['Equipment']), state: 'Not created. Needs file', level: 'file' },
    { name: 'Run Rates EU', visuals: [], pages: pagesOf('Run Rates EU').ordered.length, state: 'Not created. Decide later', level: 'none' },
    { name: 'Volume CoV EU', visuals: [], pages: pagesOf('Volume CoV EU').ordered.length, state: 'Not created. Decide later', level: 'none' },
  ];
  all.sort((a, b) => b.visuals.length - a.visuals.length || b.pages - a.pages);
  const rankOf = (t) => 1 + all.filter((o) => o.visuals.length > t.visuals.length).length;
  overview.text(PX, 170, 700, 24, bold('Priority of all 16 tables (6 created, 10 not created yet)'), 'fontSize=14;');
  overview.box(
    PX,
    200,
    700,
    92,
    esc("Ranked by the number of visuals of the EU-Level Overview page that depend on the table (Segun's data lineage: 16 visuals and selectors). A table that only feeds a column counts the visuals that use that column. Second key: report pages that read it (Power BI file, 12 pages). The lineage covers 1 of the 12 pages, so a table with 0 visuals can still matter on another page."),
    'neutral',
    'verticalAlign=top;spacingTop=6;fontSize=10.5;',
  );
  const cx = [PX, PX + 50, PX + 360, PX + 560, PX + 640];
  const cw = [44, 304, 194, 74, 60];
  ['#', 'Table', 'State', 'Visuals', 'Pages'].forEach((t, i) => overview.text(cx[i], 302, cw[i], 20, bold(t), 'fontSize=11;'));
  all.forEach((t, i) => {
    const y = 326 + i * 46;
    const vis = t.visuals.length ? `${t.visuals.length}` : '0';
    overview.box(cx[0], y, cw[0], 40, bold(String(rankOf(t))), t.level, 'verticalAlign=middle;align=center;fontSize=11;');
    overview.box(cx[1], y, cw[1], 40, esc(t.name), t.level, 'verticalAlign=middle;fontSize=10.5;');
    overview.box(cx[2], y, cw[2], 40, esc(t.state), t.level, 'verticalAlign=middle;fontSize=10;');
    overview.box(cx[3], y, cw[3], 40, bold(vis), t.level, 'verticalAlign=middle;align=center;fontSize=11;');
    overview.box(cx[4], y, cw[4], 40, esc(String(t.pages)), t.level, 'verticalAlign=middle;align=center;fontSize=11;');
  });
  overview.box(
    PX,
    326 + all.length * 46 + 10,
    700,
    150,
    [
      bold('How to read it'),
      esc('The Glidepaths feed four tables that together decide 7 visuals (1, 2, 3, 4, 5, 7, 8).'),
      esc('Loss Units (Volume Loss Correction) decide 6 visuals (2, 3, 5, 7, 8, 9).'),
      esc('Machine Names (13 visuals) and Plan OPT (9) are the base of the page and are mostly complete.'),
      esc('Format List and Equipment Coding matter on other report pages (By Format, Maintenance), not on this page.'),
    ].join('<br>'),
    'neutral',
    'verticalAlign=top;spacingTop=6;fontSize=10.5;',
  );
}
pages.push(overview);

// ---- One page per table ------------------------------------------------------------------
// How Power BI creates each table (from the load queries of the model, read 2026-10-14).
const CREATION = {
  'Machine Names EU': [
    ['Source', 'One Excel file per site, in the site folder "Machine Names".'],
    ['Per site', 'Keep MachineName, Dept, Area, Product Type. Remove "GT4 - Auto". Add SiteName (for example Hull) and a suffix (-Hull). The Hull query keeps only the departments "Dries Pack" and "Liquids Pack".'],
    ['Stack (append)', 'Nottingham + Hull + Weinheim, then Mira.'],
    ['Built column', 'Unique Machine Name = machine name + suffix, for example B2 Auto-Hull.'],
    ['Lookups (left join)', 'None.'],
    ['Not in the query', 'The links to the fact tables (on Unique Machine Name) are relationships of the model.'],
  ],
  'Plan OPT EU': [
    ['Source', 'Every file of the site folder "Plan OPT": the monthly files and the current-month file. One query per site.'],
    ['Stack (append)', 'The files of a folder into one table. Then Nottingham + Hull + Weinheim, then Mira.'],
    ['Lookups (left join)', '1. Raw shift name -> Shift Pattern file: adds the mapped Shift. 2. Targets Key (machine-site + month start) -> the three Glidepath tables: adds OEE, PDT and UPDT Target.'],
    ['Built columns', 'SiteName. Unique Machine Name (machine + -Hull). Product Key (machine key + part name). Targets Key. Time columns HH:MM:SS -> minutes (hours x 60 + minutes, the seconds are dropped).'],
    ['Clean-up', 'Remove rows without machine. Remove a fixed list of machines and "GT4 - Auto". The raw ShiftName is replaced by the mapped value. Drop Defect Parts, Target, Batch ID, ShiftStartTime, OEE and the helper keys.'],
    ['Not in the query', 'Relationships to Calendar, Machine Names, Shift Naming and Format List. The OEE % measure (good parts / capacity).'],
  ],
  'Time Utilisation EU': [
    ['Source', 'The same Plan OPT files as the Plan OPT table (one query per site).'],
    ['Per site', 'Time columns -> minutes WITH decimals (hours x 60 + minutes + seconds / 60). Key = machine + date. Group by machine and day: sum of Total Time, Planned OpT and OEE Time.'],
    ['Built columns', 'SiteName. Unique Machine Name. The date from the key.'],
    ['Stack (append)', 'Nottingham + Hull + Weinheim, then Mira.'],
    ['Lookups (left join)', 'None.'],
    ['Difference to Plan OPT', 'Plan OPT keeps whole minutes per shift and product. This table keeps decimals, one row per machine and day.'],
  ],
  'Daily Losses EU': [
    ['Source', 'Every file of the site folder "Line Losses" (the Provideam Mode Log). One query per site.'],
    ['Stack and de-duplicate', 'Files stacked, then one row per machine + start time (the files overlap).'],
    ['Clean-up', 'Remove rows with no loss group or the group "0.Review Data". Remove a fixed list of machines. About 17 text replacements on the sub group names (for example Minor Stop -> Minor Stops). Groups renamed (Planned Losses -> Planned Loss).'],
    ['Lookups (left join)', '1. Shift -> Shift Pattern file. 2. Volume Key (day + machine + group + sub group + description) -> Volume Loss Correction: Loss Units. 3. Equipment key (machine + description) -> Equipment Coding: Equipment. 4. Loss Target Key (machine + sub group + month) -> Targets Losses: Value. 5. Machine + day -> Targets Volume: Volume Total.'],
    ['Built columns', 'SiteName, Unique Machine Name, Product Key. Date and Time from StartTime. Duration -> whole minutes (seconds dropped). Target = Value / 100 (calculated column).'],
    ['Stack (append)', 'Nottingham + Hull + Weinheim, then Mira.'],
  ],
  'Shift Naming EU': [
    ['Source', 'The Shift Pattern file (all files of the regional folder, stacked) and the Mira shift file.'],
    ['Per source', 'Two columns: the raw shift name (renamed Shift Type) and Shift.'],
    ['Stack (append)', 'Provideam list + Mira list.'],
    ['Distinct', 'Keep each Shift value once. The raw name is dropped.'],
    ['Also used as a lookup', 'The hidden table "Shift Naming Provideam" is the lookup in the Plan OPT and Daily Losses queries.'],
    ['Not in the query', 'The links from the fact tables (ShiftName = Shift) are relationships of the model.'],
  ],
  Calendar: [
    ['Source', 'None. No file and no query.'],
    ['Formula', 'A DAX table: CALENDAR from 1 Jan 2011 to 31 Dec 2050.'],
    ['Added columns', 'Year, MonthNumber, Month, Quarter, QuarterNumber, MonthYearNumber, Month Year, Week Number, MonthShortName and Week Start (calculated columns).'],
    ['Lookups (left join)', 'None.'],
    ['Not in the query', 'The links from Plan OPT, Daily Losses and Time Utilisation (on the date) are relationships of the model.'],
  ],
};
const creationBox = (page, t) => {
  const parts = CREATION[t.pbi];
  if (!parts) {
    return;
  }
  const lines = parts.reduce((n, [h, x]) => n + Math.ceil((h.length + x.length + 2) / 80) + 1, 2);
  const h = Math.max(200, 15 * lines + 20);
  const y = TABLES.indexOf(t) === 0 ? 340 : 62;
  page.box(
    1340,
    y,
    600,
    h,
    [bold('How Power BI creates this table (from the load queries of the model)'), ...parts.map(([a, b]) => `${bold(a + ': ')}${esc(b)}`)].join('<br><br>'),
    'pbi',
    'verticalAlign=top;spacingTop=8;fontSize=10.5;strokeWidth=3;',
  );
};

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
  page.text(700, 172, 600, 20, bold('SIH integration') + ' (status and difference). Dashed box = SIH source: teal API endpoint, indigo built in the flow, grey none', 'fontSize=10.5;');
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
    const src = sihSource(t.pbi, r.col.name, r.color);
    const noSrc = /^(No Insights Hub|Not )/.test(src);
    const flowOnly = /^No endpoint/.test(src);
    const linesOf = (text, perLine) => Math.max(1, Math.ceil(text.length / perLine));
    const intH = 12 + 15 * (1 + linesOf(r.text, 90));
    const srcH = 10 + 14 * linesOf('SIH source: ' + src, 84);
    const rowH = Math.max(82, intH + srcH + 14);
    page.box(700, y, 600, rowH, `${bold(r.label)}<br>${esc(r.text)}`, r.color, 'verticalAlign=top;spacingTop=4;fontSize=10.5;');
    page.box(710, y + rowH - srcH - 6, 580, srcH, `${bold('SIH source: ')}${esc(src)}`, noSrc ? 'sihNone' : flowOnly ? 'sihFlow' : 'sihSrc', 'verticalAlign=middle;fontSize=10;dashed=1;dashPattern=8 4;strokeWidth=3;fillOpacity=30;' + (noSrc ? 'fontColor=#37474F;' : flowOnly ? 'fontColor=#1A237E;' : 'fontColor=#00574B;'));
    y += rowH + 8;
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
  creationBox(page, t);
  pages.push(page);
}

const FJ = JSON.parse(readFileSync('diagrams/data/sharepoint-findings.json', 'utf8'));
const fmt = (n) => Number(n).toLocaleString('en-US');
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
    esc('Not from Glidepaths: Volume Total in Daily Losses comes from the Targets Volume table. The Hull query sums the Capacity per machine and day of the Plan OPT files, so Insights Hub can build it. Visual 5 weights its target with it.'),
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
  // The text rules of the Hull query that make loss names equal to the glidepath buckets.
  const hullQuery = model.tables.find((t) => t.name === 'Daily Line Losses H').query;
  const nameRules = [...hullQuery.matchAll(/Table\.ReplaceValue\([^,]+,"([^"]+)","([^"]+)",Replacer\.ReplaceText,\{"OEELossLvl3SubGroup"\}\)/g)].map((m) => `${m[1]}  ->  ${m[2]}`);
  tp.text(40, 1000, 1500, 24, bold(`How the report makes the loss names equal to the glidepath buckets: ${nameRules.length} text rules in the Hull query`), 'fontSize=14;');
  const half = Math.ceil(nameRules.length / 2);
  tp.box(40, 1040, 740, 30 + 17 * half, nameRules.slice(0, half).map((r) => esc(r)).join('<br>'), 'file', 'verticalAlign=top;spacingTop=8;fontSize=10.5;');
  tp.box(800, 1040, 760, 30 + 17 * half, nameRules.slice(half).map((r) => esc(r)).join('<br>'), 'file', 'verticalAlign=top;spacingTop=8;fontSize=10.5;');
  const sihNames = FJ.loss_names.sih_sub_groups.map(([k, n]) => `${k ?? '(empty)'}: ${fmt(n)}`).join('   |   ');
  tp.box(40, 1040 + 30 + 17 * half + 20, 1520, 100, [bold('Insights Hub sub groups (10,100 stops of the Hull lake files)'), esc(sihNames), esc(`Only ${FJ.loss_names.sih_stops_subgroup_equals_hull_bucket} stops have a sub group that equals a bucket. The report rules above work on Provideam names, not on these. A mapping from the Insights Hub reason to the bucket is needed.`)].join('<br><br>'), 'assumed', 'verticalAlign=top;spacingTop=8;fontSize=10.5;');
  pages.push(tp);
}

// ---- Helper sheets: how each file is consumed by the report (like the Targets sheet) ----------
const pagesOfColumns = (table, cols) => {
  const set = new Set();
  cols.forEach((c) => (usage.columnPages.get(`${table}|${c}`) ?? []).forEach((p) => set.add(p)));
  return usage.pageOrder.filter((p) => set.has(p));
};
const pct = (a, b) => `${Math.round((100 * a) / b)}%`;

function consumeSheet(cfg) {
  const sp = new Page(cfg.name);
  sp.text(40, 20, 1500, 30, bold(cfg.title), 'fontSize=18;');
  sp.box(40, 62, 1520, 62, esc(cfg.intro), 'neutral', 'verticalAlign=top;spacingTop=6;fontSize=11;');
  const head = (x, text) => sp.text(x, 140, 330, 20, bold(text), 'fontSize=12;');
  head(40, '1 Source file');
  head(430, '2 Table in the report');
  head(830, '3 Columns it fills');
  head(1230, '4 Where they are used');
  const L = cfg.level || 'file';
  const lines = (arr) => arr.map((x) => (x.startsWith('**') ? bold(x.slice(2)) : esc(x))).join('<br><br>');
  const srcH = cfg.srcH || 330;
  const src = sp.box(40, 170, 330, srcH, lines(cfg.src), L, 'verticalAlign=top;spacingTop=6;fontSize=10.5;');
  const tbl = cfg.tables.map((t, i) =>
    sp.box(430, 170 + i * 104, 330, 94, bold(t.name) + '<br>' + esc(t.cols) + '<br>' + esc(t.note), L, 'verticalAlign=top;spacingTop=4;fontSize=10;'),
  );
  tbl.forEach((id) => sp.edge(src, id, '#9673a6'));
  const col = cfg.columns.map((c, i) =>
    sp.box(830, 170 + i * 72, 330, 62, bold(c.label) + (c.note ? '<br>' + esc(c.note) : ''), L, 'verticalAlign=top;spacingTop=4;fontSize=10;'),
  );
  cfg.columns.forEach((c, i) => sp.edge(tbl[c.table ?? 0], col[i], '#9673a6'));
  let vy = 170;
  const vis = cfg.visuals.map((v) => {
    const id = sp.box(1230, vy, 330, v.h || 38, esc(v.text), 'pbi', 'fontSize=10.5;');
    vy += (v.h || 38) + 8;
    return id;
  });
  cfg.visuals.forEach((v, i) => sp.edge(col[v.col ?? 0], vis[i], '#6c8ebf'));
  const bottom = Math.max(170 + srcH, 170 + cfg.tables.length * 104, 170 + cfg.columns.length * 72, vy) + 30;
  let y = bottom;
  if (cfg.note) {
    sp.box(430, y - 10, 1130, 46, esc(cfg.note), 'none', 'fontSize=10.5;');
    y += 50;
  }
  sp.text(40, y, 1500, 24, bold(cfg.chainTitle), 'fontSize=14;');
  const ch = cfg.chain;
  const chainBox = (x, c) => sp.box(x, y + 40, 330, 168, [bold(c.title), ...c.lines.map((l) => esc(l))].join('<br><br>'), c.level, 'verticalAlign=top;spacingTop=6;fontSize=10.5;');
  const a = chainBox(40, ch.a);
  const b = chainBox(430, ch.b);
  const c = chainBox(830, ch.c);
  const good = sp.box(1230, y + 40, 330, 76, bold(ch.good[0]) + '<br>' + esc(ch.good[1]), 'ok', 'verticalAlign=top;spacingTop=6;fontSize=10.5;');
  const bad = sp.box(1230, y + 132, 330, 76, bold(ch.bad[0]) + '<br>' + esc(ch.bad[1]), 'empty', 'verticalAlign=top;spacingTop=6;fontSize=10.5;');
  sp.edge(a, b, '#666666');
  sp.edge(b, c, '#666666');
  sp.edge(c, good, '#82b366');
  sp.edge(c, bad, '#b85450', true);
  sp.box(40, y + 228, 1520, 40 + 20 * cfg.risks.length, [bold('What can make the texts differ or the file fail'), ...cfg.risks.map((r) => esc(r))].join('<br>'), 'assumed', 'verticalAlign=top;spacingTop=6;fontSize=10.5;');
  pages.push(sp);
}

// Sheet: Format List
{
  const f = FJ.formats;
  const pg = pagesOf('Format List EU').ordered;
  consumeSheet({
    name: 'Explanation Format List',
    title: 'Format List: from the Format Mapping files to the By Format page',
    intro: `Purple = needs the Format Mapping files (checked 2026-10-14 on the Hull file). Blue = Power BI page. Which page uses which column comes from the Power BI report file. Insights Hub has no brand, size or count: only the product name, code, description and design speed.`,
    src: [
      '**Format Mapping files',
      'SharePoint, Nottingham site, regional folder. Kept by hand: one file per site (Hull, Mira, Weinheim).',
      'Columns: Site Name | MachineName | Product Name | Brand | Unit Size | Unit Count/Format | Extra Info',
      `Hull file: ${f.hull_rows} rows, ${f.hull_machines} machines, ${f.hull_products} products.`,
      `Example (GT4): ${f.gt4_row['Product Name']} | ${f.gt4_row.Brand} | ${f.gt4_row['Unit Size']} | ${f.gt4_row['Unit Count/Format']} | ${f.gt4_row['Extra Info']}`,
    ],
    tables: [{ name: 'Format List EU', cols: 'Product Name, Brand, Unit Size, MachineName, Product Key, Unit Count/Format, Extra Info, Site Name', note: 'Product Key = machine name + site + product name (built by the report)' }],
    columns: [{ label: 'Format List EU [Brand, Unit Size, Unit Count/Format, Extra Info]', note: 'looked up by Product Key', table: 0 }, { label: 'Used by the relationships', note: 'Plan OPT EU [Product Key] and Daily Losses EU [Product Key] join to Format List EU [Product Key]', table: 0 }],
    visuals: [{ text: `Pages that use the format columns: ${pagesOfColumns('Format List EU', ['Brand', 'Unit Size', 'Unit Count/Format', 'Product Name']).join(', ') || pg.join(', ')}`, h: 70, col: 0 }, { text: 'Without a match the product has no brand, size or count (empty values)', h: 70, col: 1 }],
    srcH: 300,
    chainTitle: 'How one product finds its format: the product texts must be equal',
    chain: {
      a: { title: '1 A product in the Insights Hub data', level: 'ours', lines: ['Machine: GT4', `Part name: ${f.sih.GT4.sih_example[1]}`, 'Machine B2 Line, part name: ' + f.sih['B2 Line'].sih_example[0]] },
      b: { title: '2 The report builds a key', level: 'pbi', lines: ['Product Key = machine name + site + product name', `GT4-Hull ${f.sih.GT4.sih_example[1]}`] },
      c: { title: '3 It looks for the same text in the file', level: 'file', lines: [`GT4-Hull ${f.gt4_row['Product Name']}`, `-> Brand ${f.gt4_row.Brand}, size ${f.gt4_row['Unit Size']}, count ${f.gt4_row['Unit Count/Format']}`, 'B2 products in the file have short names, for example ' + f.b2_row['Product Name']] },
      good: ['Texts are equal', `GT4: ${f.sih.GT4.in_format_list} of ${f.sih.GT4.sih_part_names} Insights Hub part names are in the file.`],
      bad: ['Texts differ', `B2 Line: ${f.sih['B2 Line'].in_format_list} of ${f.sih['B2 Line'].sih_part_names}. Insights Hub has SAP-style descriptions, the file has short names.`],
    },
    risks: [
      `1. B2 names: Insights Hub part names (for example ${f.sih['B2 Line'].sih_example[0]}) do not exist in the file. Provideam B2 names in the last 4 months: ${f.b2_provideam_names.join(', ')}. Fix: a mapping table from the Insights Hub product code to the Provideam product name.`,
      `2. The file is not complete: ${f.provideam_pairs_found} of ${f.provideam_pairs} (machine, part) pairs of the Hull Plan OPT files are in the Hull list (${pct(f.provideam_pairs_found, f.provideam_pairs)}). New products need a new row by hand.`,
      '3. The key uses the Provideam machine name (B2 Auto) and the site suffix. Insights Hub says B2 Line. Fix: a mapping of machine names.',
    ],
  });
}

// Sheet: Shift names
{
  const s = FJ.shift;
  consumeSheet({
    name: 'Explanation Shift names',
    title: 'Shift names: from the Shift Pattern file to the shift selector',
    intro: 'Purple = needs the Shift Pattern file (checked 2026-10-14). Blue = Power BI visual or page. The report shows the mapped Shift value (Day, Night, Afternoon or the crew colour), not the raw Provideam shift name.',
    src: [
      '**Shift Pattern file',
      'SharePoint, Nottingham site, regional folder. Kept by hand: one file for all sites.',
      'Columns: ShiftName (raw) | Shift',
      `${s.rows} rows, ${s.values.length} Shift values: ${s.values.join(', ')}.`,
      'Examples: ' + s.examples.slice(0, 5).map((e) => `${e[0]} -> ${e[1]}`).join('; '),
    ],
    tables: [
      { name: 'Shift Naming Provideam (hidden)', cols: 'Shift, Shift Type (= raw ShiftName)', note: 'joined to every Plan OPT and loss row on the raw shift name' },
      { name: 'Shift Naming EU', cols: 'Shift', note: 'the list of shift values; fact tables join to it' },
    ],
    columns: [
      { label: 'Plan OPT EU [ShiftName]', note: 'the raw name is dropped, the mapped value is kept', table: 0 },
      { label: 'Daily Losses EU [ShiftName]', note: 'same mapping', table: 0 },
      { label: 'Shift Naming EU [Shift]', note: 'relationship target of both', table: 1 },
    ],
    visuals: [{ text: '16 Shift Name selector (EU-Level Overview)', col: 2 }, { text: `Pages: ${pagesOf('Shift Naming EU').ordered.join(', ')}`, h: 70, col: 2 }],
    srcH: 300,
    chainTitle: 'How one shift finds its value: the raw name must be in the file',
    chain: {
      a: { title: '1 A shift in the Insights Hub data', level: 'ours', lines: [`Calendar event names: ${s.sih_names.join(', ')}`, 'Hull and GT4 shifts are events of the Insights Hub calendar'] },
      b: { title: '2 The report needs a Shift value', level: 'pbi', lines: ['Plan OPT EU [ShiftName] must be one of the Shift values', `${s.values.join(', ')}`] },
      c: { title: '3 Provideam side (file)', level: 'file', lines: [`Raw names of the Hull Plan OPT files: ${s.hull_raw_names}. In the file: ${s.hull_raw_in_coding} (all).`, 'Example: SunDay - Blue -> Blue'] },
      good: ['Names are equal', `${s.sih_in_values.join(', ')} exist as Shift values.`],
      bad: ['Names differ', `${s.sih_not_in_values.join(', ')} are not in the list. Day, Night and Afternoon are not Insights Hub names.`],
    },
    risks: [
      '1. Insights Hub shift names Yellow, Shift 1 and Shift 2 have no Shift value. Fix: a mapping from the Insights Hub shift to a Shift value, or new rows in the file.',
      '2. The report uses Day, Night and Afternoon for 8 hour shifts and the crew colour for 12 hour crews. Insights Hub names the 12 hour crews. Fix: one rule for both systems.',
      '3. A new raw Provideam name needs a new row in the file by hand. Without it the row has no shift (null).',
    ],
  });
}

// Sheet: Machine Names
{
  consumeSheet({
    name: 'Explanation Machine Names',
    title: 'Machine Names: from the Machine Names files to the selectors',
    intro: 'Purple = needs the Machine Names files. Hull file: NOT downloaded (no access to the folder). Nottingham and Weinheim files were downloaded and checked (same 4 columns). The local copy sample has 29 Hull rows. Blue = Power BI visual or page.',
    src: [
      '**Machine Names files',
      'SharePoint, one folder per site. Kept by hand. The guide says a new line needs a row here (required); a line is removed with a filter.',
      'Columns: MachineName | Dept | Area | Product Type',
      'Nottingham: 66 rows (Dept for example Strepsils, Solid Dose). Weinheim: 6 rows (Fixatives, Tablets).',
      'Hull sample: B2 Auto | Liquids Pack | Liquids | Bottles',
    ],
    tables: [{ name: 'Machine Names EU', cols: 'MachineName, Dept, Area, Product Type, SiteName, Unique Machine Name', note: 'SiteName and Unique Machine Name (machine name + -Hull) are added by the report' }],
    columns: [
      { label: 'Machine Names EU [Dept, Area, Product Type]', note: 'stand-in today: the Insights Hub area', table: 0 },
      { label: 'Machine Names EU [MachineName, SiteName]', note: 'from the Insights Hub asset hierarchy', table: 0 },
      { label: 'Machine Names EU [Unique Machine Name]', note: 'hidden key of every fact table', table: 0 },
    ],
    visuals: [
      { text: '11 Site, 12 Department, 14 Line, 15 Product Type selectors (EU-Level Overview)', h: 54, col: 0 },
      { text: `Pages: ${pagesOf('Machine Names EU').ordered.join(', ')}`, h: 70, col: 0 },
      { text: 'Relationships: every fact table joins on Unique Machine Name', h: 54, col: 2 },
    ],
    srcH: 300,
    chainTitle: 'How a machine finds its filters: the key texts must be equal',
    chain: {
      a: { title: '1 A machine in the Insights Hub data', level: 'ours', lines: ['Asset B2 Line, hierarchy Hull / Bottles / B2 Line', 'Key today: the asset ID (32 characters)'] },
      b: { title: '2 The report key', level: 'pbi', lines: ['Unique Machine Name = machine name + "-Hull"', 'B2 Auto-Hull (Plan OPT, Daily Losses, Glidepaths, Format List all use it)'] },
      c: { title: '3 The file row', level: 'file', lines: ['B2 Auto | Liquids Pack | Liquids | Bottles', 'Dept, Area and Product Type come only from this file'] },
      good: ['Keys are equal', 'The machine shows in the selectors with its Dept, Area and Product Type.'],
      bad: ['Keys differ', 'B2 Line (Insights Hub) is not B2 Auto-Hull: the machine has no row or no filters.'],
    },
    risks: [
      '1. Machine key: Insights Hub uses the asset ID, the report uses machine name + site. Decision open. Either the Insights Hub tables write the report key, or a mapping table links them.',
      '2. Names differ: B2 Line (Insights Hub) and B2 Auto (Provideam, files). GT4 is the same in both.',
      '3. Dept, Area and Product Type are three different columns in the file (for example Liquids Pack, Liquids, Bottles). Insights Hub has one area. Today all three columns take the area.',
      '4. The Hull file was not downloaded. Access to the folder is needed.',
    ],
  });
}

// Sheet: Equipment Coding
{
  const e = FJ.equipment;
  consumeSheet({
    name: 'Explanation Equipment Coding',
    title: 'Equipment Coding: from the Equipment Coding files to the Equipment column',
    intro: 'Purple = needs the Equipment Coding files. Hull file: NOT downloaded (no access). Nottingham and Weinheim files were checked. Blue = Power BI page. The guide says the board works without this file (optional).',
    src: [
      '**Equipment Coding files',
      'SharePoint, one folder per site. Kept by hand: for every machine and loss description, the equipment that caused the loss.',
      'Columns: MachineName | OEELossLvl3Desc | Merged Unique Identifier | Equipment | Lvl 3 Loss Name (empty in all rows)',
      `Nottingham: ${fmt(e.Nottingham.rows)} rows, ${e.Nottingham.machines} machines, ${e.Nottingham.equipment_values} equipment values. Weinheim: ${e.Weinheim.rows} rows, ${e.Weinheim.machines} machines.`,
      `Example: ${e.Nottingham.example.MachineName} ${e.Nottingham.example.OEELossLvl3Desc} -> ${e.Nottingham.example.Equipment}`,
    ],
    tables: [{ name: 'Equipment Coding H / N / W (hidden)', cols: 'Merged Unique Identifier, Equipment, Lvl 3 Loss Name', note: 'key = machine name + loss description. An empty Equipment becomes "Unclassed"' }],
    columns: [{ label: 'Daily Losses EU [Equipment]', note: 'looked up with the key machine + loss description', table: 0 }],
    visuals: [{ text: `Pages that use Equipment: ${pagesOfColumns('Daily Losses EU', ['Equipment']).join(', ') || 'none found'}`, h: 70, col: 0 }],
    srcH: 300,
    chainTitle: 'How one stop finds its equipment: the machine and the description must be equal',
    chain: {
      a: { title: '1 A stop in the Insights Hub data', level: 'ours', lines: ['Machine: B2 Line', 'Reason (leaf): 001 PRESSED EMERGENCY IN MAIN P.B.PANEL AREA', 'Second reason level (stand-in): for example Capper'] },
      b: { title: '2 The report builds a key', level: 'pbi', lines: ['Equipment Loss Key = machine name + loss description', 'B2 Auto 001 PRESSED EMERGENCY IN MAIN P.B.PANEL AREA'] },
      c: { title: '3 It looks for the same text in the file', level: 'file', lines: [`Provideam descriptions look like: ${e.Nottingham.example.OEELossLvl3Desc}`, 'Hull descriptions seen in the guide: Cleaning Area, Labeller Head 1 Coding'] },
      good: ['Texts are equal', `Nottingham: ${pct(e.Nottingham.stop_rows_covered, e.Nottingham.stop_rows)} of the unplanned stops have an entry. Weinheim: ${pct(e.Weinheim.stop_rows_covered, e.Weinheim.stop_rows)}.`],
      bad: ['Texts differ', 'The stop gets "Unclassed" or no equipment. B2 reason texts of Insights Hub are alarm texts, not Provideam descriptions.'],
    },
    risks: [
      '1. The reason text of Insights Hub (B2: alarm texts) is not the Provideam description. Fix: a mapping from the Insights Hub reason to the Provideam description, or an equipment column kept in Insights Hub.',
      '2. Coverage depends on the people who keep the file: 98% (Nottingham) and 70% (Weinheim) of the unplanned stops. New loss types need a new row.',
      '3. The Hull file was not downloaded. Access to the folder is needed.',
    ],
  });
}

// Sheet: Loss Units
{
  const u = FJ.loss_units;
  consumeSheet({
    name: 'Explanation Loss Units',
    title: 'Loss Units: from the Volume Loss Correction files to the Loss Units column',
    intro: 'Purple = needs the Volume Loss Correction files. They are a daily Provideam report (OEE Loss, group by object), not a manual file. Hull file: NOT downloaded (no access). Nottingham and Weinheim files were checked. Blue = Power BI visual.',
    src: [
      '**Volume Loss Correction files',
      'SharePoint, one folder per site. Written by a Provideam report (OEE Loss, group by object), one file per month plus the current month.',
      'Columns: ShiftStartDate | MachineName | OEELossLvl3Group | OEELossLvl3SubGroup | OEELossLvl3Desc | Time | Loss Units',
      `Example: ${u.example.MachineName}, ${u.example.OEELossLvl3Group}, ${u.example.OEELossLvl3SubGroup}, ${u.example.Time}, ${u.example['Loss Units']} units`,
    ],
    tables: [{ name: 'Volume Loss Correction H / N / W (hidden)', cols: 'Loss Units, Volume Key, Time in Mins, Hour/Minute/Second Time', note: 'Volume Key = day + machine + group + sub group + description. The key must be unique (maintenance guide)' }],
    columns: [{ label: 'Daily Losses EU [Loss Units]', note: 'joined on the Volume Key', table: 0 }],
    visuals: [
      { text: '2 Unplanned Loss %, 3 Planned Loss %', col: 0 },
      { text: '5 Top 5 Loss Categories, 8 Unplanned Loss vs Target', col: 0 },
      { text: '7 Planned Loss vs Target, 9 Top Losses', col: 0 },
    ],
    srcH: 300,
    chainTitle: 'How Loss Units are made: the rule is the same in both systems',
    chain: {
      a: { title: '1 Insights Hub (our assumption)', level: 'ours', lines: ['Loss Units = design speed per minute x stop minutes', 'design speed from the product (productCollections/.../products)', 'duration from downtimeReasons'] },
      b: { title: '2 Provideam (the file)', level: 'file', lines: ['Loss Units = loss time x capacity per planned minute of the product', `Checked on Nottingham: ${fmt(u.within_3_percent)} of ${fmt(u.machine_days)} machine-days within 3% (median ratio ${u.median_ratio})`] },
      c: { title: '3 The report', level: 'pbi', lines: ['Daily Losses EU [Loss Units] is looked up by the Volume Key', 'Loss % = Loss Units / Capacity (Plan OPT)'] },
      good: ['Same rule', 'If the speed per minute is the same, the Loss Units are the same.'],
      bad: ['Different speed', 'Capacity per minute of Provideam differs from the design speed of Insights Hub: the numbers differ.'],
    },
    risks: [
      '1. The rule is confirmed on Nottingham data, not on Hull (Hull file missing). The speed per minute decides the result: Provideam capacity against Insights Hub design speed (B2: one speed per product, GT4: not always the design speed).',
      '2. The file is a daily total per machine, reason and day. Insights Hub has one row per stop. The report joins on day + machine + reason. Fix: build the same key, and check that the sum per key is equal.',
      '3. Planned losses exist in the file (groups Planned Losses, Production Not Scheduled). Insights Hub has no planned stops in the Hull data.',
    ],
  });
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

// ---- Page: how the data is collected and where it conflicts with Insights Hub ------------------
{
  const cs = new Page('Explanation Data collection and conflicts');
  const g = FJ.glidepath;
  const f = FJ.formats;
  const s = FJ.shift;
  const ln = FJ.loss_names;
  cs.text(40, 20, 1500, 30, bold('Data collection: how each data item reaches the lake and where it conflicts with Insights Hub'), 'fontSize=18;');
  cs.box(
    40,
    62,
    1520,
    62,
    esc('Status 2026-10-14, from the downloaded SharePoint files (Hull, Nottingham, Weinheim; Mira and most Hull folders not reachable). Collection today: the user copies files by hand to the data lake. Next step: Power Automate sends the file to a VFC endpoint, the VFC writes a parquet file. Not tested: file size limit, key handling and POST on the VFC http in node.'),
    'neutral',
    'verticalAlign=top;spacingTop=6;fontSize=11;',
  );
  const chain = (y, label, steps) => {
    cs.text(40, y - 24, 700, 20, bold(label), 'fontSize=12;');
    const ids = steps.map(([text, lv], i) => cs.box(40 + i * 258, y, 235, 62, esc(text), lv || 'neutral', 'verticalAlign=middle;fontSize=10.5;'));
    for (let i = 0; i < ids.length - 1; i += 1) {
      cs.edge(ids[i], ids[i + 1], '#666666');
    }
  };
  chain(170, 'Files (Provideam reports and Excel files kept by hand)', [
    ['SharePoint folder (Hull and Nottingham sites)'],
    ['NOW: the user copies the file by hand', 'assumed'],
    ['NEXT: Power Automate sends the file to a VFC endpoint (not tested)', 'file'],
    ['VFC converts the file to parquet (encoding, tab, Total row, comment quotes)'],
    ['Data lake: one parquet file per file type, with the download date'],
    ['Mapping tables (machine, product, shift, reason names) and Power BI', 'pbi'],
  ]);
  chain(290, 'Insights Hub (OEE API)', [
    ['Insights Hub OEE API'],
    ['VFC flows, run daily'],
    ['Data lake: pbi_* parquet files'],
    ['Same mapping tables'],
    ['Power BI board (target)', 'pbi'],
  ]);
  const lg = [
    ['assumed', 'Conflict with Insights Hub: a mapping or decision is needed'],
    ['ok', 'No conflict: same rule or only one source'],
    ['empty', 'Open question: Reckitt must decide'],
    ['none', 'Group 2, decide later'],
  ];
  lg.forEach(([level, text], i) => cs.box(40 + i * 385, 365, 370, 34, esc(text), level, 'fontSize=10.5;'));
  const hx = [40, 360, 700, 1190];
  const hw = [310, 330, 480, 370];
  ['Data item', 'Source and how it is collected', 'Conflict with Insights Hub', 'Resolution'].forEach((t, i) => cs.text(hx[i], 412, hw[i], 20, bold(t), 'fontSize=12;'));
  const rows = [
    ['Targets (Glidepaths)', `Excel/CSV kept by hand, one file per site (Hull: ${g.hull_lines.length} lines, 2026 ${Math.round(g.filled_2026 * 100)}% filled, 2027 empty). Copy by hand, later Power Automate`, `Line names (B2 Auto against B2 Line). Loss names: ${ln.sih_stops_subgroup_equals_hull_bucket} of ${fmt(ln.sih_stops)} Insights Hub stops have a sub group that equals a bucket`, 'Mapping tables: line names, and reason to bucket (start from the 17 text rules of the Hull query)', 'assumed'],
    ['Product format (brand, size, count)', `Format Mapping file kept by hand (Hull ${f.hull_rows} rows). Copy by hand`, `B2 Line: ${f.sih['B2 Line'].in_format_list} of ${f.sih['B2 Line'].sih_part_names} product names match (SAP-style against short names). GT4: ${f.sih.GT4.in_format_list} of ${f.sih.GT4.sih_part_names} match`, 'Mapping from the Insights Hub product code to the Provideam product name (B2)', 'assumed'],
    ['Shift names', `Shift Pattern file, one for all sites (${s.rows} rows, ${s.values.length} values). Copy by hand`, `${s.sih_not_in_values.join(', ')} have no Shift value. Day, Night, Afternoon are not Insights Hub names`, 'Mapping from the Insights Hub shift to a Shift value, or new rows in the file', 'assumed'],
    ['Machine names, Dept, Area, Product Type', 'Machine Names file per site (Hull: no access, local copy sample only). Copy by hand', 'B2 Line against B2 Auto. Three columns in the file, one area in Insights Hub. Asset ID against machine name + site as key', 'The file is the master for Dept, Area, Product Type. Mapping for names. Decision on the key is open', 'assumed'],
    ['Equipment of a stop', 'Equipment Coding file per site (Hull: no access). Copy by hand', 'Insights Hub reason texts (B2: alarm texts) are not the Provideam descriptions the file uses', 'Mapping reason to description, or an equipment attribute kept in Insights Hub', 'assumed'],
    ['Production actuals (good parts, capacity, times)', 'Provideam Plan OPT files: monthly and current month, rewritten by an hourly job. Not needed if Insights Hub is the source', 'Both systems have it. On the overlap days Insights Hub is 96.6% (B2) and 43.6% (GT4) of Provideam', 'Reckitt decides the official source per site. Keep the files for comparison', 'empty'],
    ['Stops, comments, planned losses', `Provideam Line Losses files. Comment text is filled for ${pct(ln.provideam.Nottingham.has_comment, ln.provideam.Nottingham.stop_rows)} of the Nottingham rows`, 'Reason names differ. Insights Hub has the comment count only and no Planned Loss in the Hull data', 'Comment text: read the comment endpoint or accept the gap. Planned losses: from the shift calendar', 'assumed'],
    ['Loss Units', 'Provideam Volume Loss Correction files (daily)', `Same rule (minutes x capacity per minute: ${fmt(FJ.loss_units.within_3_percent)} of ${fmt(FJ.loss_units.machine_days)} machine-days within 3%). Differs only if the speed differs`, 'Compute in the flow. Check the sums against the file', 'ok'],
    ['Volume Total', 'Built from the Plan OPT Capacity per machine and day (Hull query)', 'None, it follows the capacity', 'Build it in the flow (not built yet)', 'ok'],
    ['Run rates (hourly)', 'Provideam Packing Hourly Run Rates files (Nottingham, Weinheim seen)', 'Insights Hub has hourly KPIs. Not compared', 'Group 2: decide later', 'none'],
    ['Calendar', 'Generated by the flow', 'None', 'None', 'ok'],
  ];
  let y = 440;
  rows.forEach(([item, srcText, conflict, resolution, level]) => {
    const h = Math.max(60, 14 * Math.ceil(Math.max(conflict.length / 64, srcText.length / 42, resolution.length / 50)) + 12);
    cs.box(hx[0], y, hw[0], h, bold(item), level, 'verticalAlign=middle;fontSize=10.5;');
    cs.box(hx[1], y, hw[1], h, esc(srcText), level, 'verticalAlign=middle;fontSize=10;');
    cs.box(hx[2], y, hw[2], h, esc(conflict), level, 'verticalAlign=middle;fontSize=10;');
    cs.box(hx[3], y, hw[3], h, esc(resolution), level, 'verticalAlign=middle;fontSize=10;');
    y += h + 8;
  });
  cs.text(40, y + 6, 1500, 24, bold('Open decisions and blockers'), 'fontSize=14;');
  cs.box(
    40,
    y + 40,
    1520,
    150,
    [
      esc('1. Official OEE source per site, today and after the move (Provideam or Insights Hub). Question for Mei Shin and Asif.'),
      esc('2. Machine key: asset ID or machine name + site. All mapping tables depend on it.'),
      esc('3. Who builds the Power Automate flow, and the VFC receiver: file size limit and key handling are not tested.'),
      esc('4. Access: Hull folders Equipment Coding, Line Losses, Machine Names, Packing Run Rates, Volume Loss Correction; the whole Mira site.'),
      esc('5. File format for the integration: Provideam files are UTF-16 with tab separation, CR line ends, a Total row and comments with unescaped quotes. Ask for a clean export.'),
    ].join('<br><br>'),
    'neutral',
    'verticalAlign=top;spacingTop=8;fontSize=11;',
  );
  pages.push(cs);
}

// ---- Page: plan to get the missing data (three options) ---------------------------------------
{
  const pl = new Page('Explanation Plan to get the missing data');
  const box = (x, y, w, h, html, level, extra = '') => pl.box(x, y, w, h, html, level, `verticalAlign=top;spacingTop=6;fontSize=10.5;${extra}`);
  const para = (arr) => arr.map((a, i) => (i === 0 && a.startsWith('**') ? bold(a.slice(2)) : esc(a))).join('<br><br>');
  pl.text(40, 20, 1500, 30, bold('Plan to get the missing data into the data lake: three options'), 'fontSize=18;');
  box(
    40,
    62,
    1520,
    74,
    esc('Why: Insights Hub has no data for targets, product formats, shift names, machine groups and equipment. The Power BI report gets them from SharePoint files. Status 2026-10-14. Files seen: Hull (partly), Nottingham, Weinheim. Mira: no access. Chartres, NMD and Tuzla: not checked. This sheet is for the decision with Asif.'),
    'neutral',
    'fontSize=11;',
  );

  // 1 What must be collected
  pl.text(40, 150, 1500, 24, bold('1 What must be collected'), 'fontSize=14;');
  box(40, 184, 750, 160, para(['**Class A: reference files (small, change rarely)', 'Glidepaths (4 files, 12 to 69 KB), Format Mapping (3 files, 3 to 15 KB), Shift Pattern (1 file, 5 KB), Machine Names (per site, 16 to 18 KB), Equipment Coding (per site, 8 to 265 KB).', 'Kept by hand by the sites. Glidepaths change monthly or yearly (the 2027 targets are still empty). Needed in every case, whatever the OEE source is.']), 'file');
  box(810, 184, 750, 160, para(['**Class B: Provideam report files (large, rewritten every hour)', 'Plan OPT, Line Losses, Run Rates, Volume Loss Correction: one file per month plus the current month, 17 KB to 6.5 MB each.', 'Needed only if Provideam data is kept next to Insights Hub (to compare or to migrate). Not needed if Insights Hub is the official source: this decision is open.']), 'assumed');

  // 2 Three options
  pl.text(40, 370, 1500, 24, bold('2 Three options (numbers as in our earlier discussion)'), 'fontSize=14;');
  const opts = [
    {
      x: 40,
      level: 'assumed',
      title: '1  Power Automate sends the files',
      how: 'A flow of Reckitt runs when a file is created or changed in the SharePoint folder. It sends the file by HTTP POST to an endpoint of our VFC (http in node). The VFC converts the file and writes parquet to the data lake. Reckitt already runs Power Automate flows for these reports (maintenance guide).',
      needs: 'A person at Reckitt builds and owns one flow per file type. We build and own the VFC receiver and give them the endpoint address and key (never in documents).',
      tested: 'NOT tested. To check: size limit and body format of the VFC http in node, UTF-16 files, key handling, and whether the HTTP action of Power Automate needs a premium licence.',
      good: 'Push on change, no polling. No new access to SharePoint for us. A tool Reckitt already knows. One receiver serves all sites.',
      risks: 'A flow can fail without anyone noticing: we need a heartbeat check in our log. Large files (up to 6.5 MB) may exceed the limit. Reckitt must keep the flow alive. The key is a secret inside their flow.',
    },
    {
      x: 560,
      level: 'assumed',
      title: '2  Direct access: the VFC reads SharePoint',
      how: 'The VFC calls Microsoft Graph (or the SharePoint REST API) on a schedule, lists the folders, downloads new or changed files, converts them and writes parquet to the lake. It logs in with an app registration or a service account with read access to the folders.',
      needs: 'Reckitt IT creates the app registration or service account and gives read access to the folders of all sites. We keep the secret in the Config node. The VFC must be allowed to call the Microsoft hosts.',
      tested: 'NOT tested. To check: can the VFC reach the Microsoft login and Graph hosts, token handling in an http request node, and how long the IT approval takes.',
      good: 'Fully in our control: schedule, retries, file history, logs. Nothing for Reckitt to maintain after the setup. One setup works for all sites.',
      risks: 'IT approval is probably the slowest step. A secret that can read SharePoint must be kept safe and renewed. The permission scope may be wider than we need.',
    },
    {
      x: 1080,
      level: 'ok',
      title: '3  Manual copy (interim, works now)',
      how: 'The user downloads the files from SharePoint (browser, or Claude in Chrome) into the project folder. A script converts them (the loader is not built yet). The user puts the converted files into the data lake. First run: 36 files from the Nottingham site on 2026-10-14.',
      needs: 'Access to each folder. Missing: five Hull folders and the whole Mira site.',
      tested: 'TESTED and working on 2026-10-14: 36 files, all complete. Chrome blocks repeated automatic downloads, so real clicks are needed.',
      good: 'No dependency on Reckitt IT. Good enough for Class A (small files, rare changes). Starts today.',
      risks: 'Manual work and delay. Class B files change every hour and go stale. Someone must remember to repeat it. Risk of an old file version: keep the download date in the file name.',
    },
  ];
  opts.forEach((o) => {
    box(o.x, 404, 480, 52, bold(o.title), o.level, 'verticalAlign=middle;fontSize=12;');
    box(o.x, 464, 480, 156, para(['**How it works', o.how]), 'neutral');
    box(o.x, 628, 480, 104, para(['**What Reckitt must do', o.needs]), 'neutral');
    box(o.x, 740, 480, 104, para(['**Tested?', o.tested]), o.level === 'ok' ? 'ok' : 'empty');
    box(o.x, 852, 480, 96, para(['**Good', o.good]), 'ok');
    box(o.x, 956, 480, 126, para(['**Risks', o.risks]), 'assumed');
  });

  // 3 Fit per class
  pl.text(40, 1110, 1500, 24, bold('3 Which option fits which class'), 'fontSize=14;');
  const fit = [
    ['Class A: reference files', [['ok', 'Good fit. Small files, a push on change is enough.'], ['partial', 'Works, but heavy for 5 small files that change rarely.'], ['ok', 'Good fit now. Enough while the files change rarely.']]],
    ['Class B: Provideam report files', [['assumed', 'Possible. Size limit to test, and a push every hour.'], ['ok', 'Best fit: schedule, history, large files.'], ['empty', 'Poor fit. The files go stale within hours.']]],
  ];
  fit.forEach(([label, cells], i) => {
    const y = 1146 + i * 96;
    pl.text(40, y, 700, 20, bold(label), 'fontSize=11;');
    cells.forEach(([level, text], j) => box(opts[j].x, y + 22, 480, 56, esc(text), level, 'verticalAlign=middle;'));
  });

  // 4 Recommended sequence
  pl.text(40, 1350, 1500, 24, bold('4 Recommended sequence'), 'fontSize=14;');
  const steps = [
    ['ok', '1 Now', 'Manual copy of Class A for Hull, Nottingham and Weinheim (36 files done). Request the missing access: five Hull folders and the Mira site.'],
    ['assumed', '2 Small test', 'Power Automate sends ONE small file (for example the Weinheim Glidepath, 12 KB) to a test endpoint in the VFC. It answers: size, key, UTF-16, licence.'],
    ['assumed', '3 In parallel', 'Ask Reckitt IT if an app registration or a service account is possible (option 2).'],
    ['empty', '4 Decide', 'Per class: Class A by option 1 or 2, or stay manual. Class B only if Provideam data is kept.'],
    ['none', '5 Roll out', 'All 7 sites from one site list. A missing or late file shows in a report after each run.'],
  ];
  steps.forEach(([level, t, text], i) => box(40 + i * 306, 1384, 290, 132, para(['**' + t, text]), level));

  // 5 Decisions
  pl.text(40, 1546, 1500, 24, bold('5 Decisions and help needed from Reckitt'), 'fontSize=14;');
  box(
    40,
    1580,
    1520,
    150,
    [
      esc('1. Which option for Class A: Power Automate, direct access, or manual for now.'),
      esc('2. Who at Reckitt builds and owns the Power Automate flow.'),
      esc('3. A contact in Reckitt IT for an app registration or a service account.'),
      esc('4. The official OEE source per site (decides whether Class B is needed).'),
      esc('5. Access: five Hull folders, the Mira site, and the files of Chartres, NMD and Tuzla (not seen yet).'),
    ].join('<br><br>'),
    'neutral',
    'fontSize=11;',
  );

  // 6 Which data first
  pl.text(40, 1760, 1500, 24, bold('6 Which missing data first: ranked by the visuals it affects (EU-Level Overview page, Segun lineage)'), 'fontSize=14;');
  const cols = [40, 480, 880, 980];
  const widths = [430, 390, 90, 580];
  ['Missing data', 'Visuals affected', 'Count', 'First action'].forEach((t, i) => pl.text(cols[i], 1796, widths[i], 20, bold(t), 'fontSize=11;'));
  const first = [
    ['Glidepaths (targets)', '1, 2, 3, 4, 5, 7, 8', '7', 'Files for Hull, Nottingham and Weinheim are downloaded. Next: map line names and loss names.', 'file'],
    ['Loss names and Loss Units', '2, 3, 5, 7, 8, 9', '6', 'Mapping from Insights Hub reasons to the buckets (start from the 17 Hull rules). Check Loss Units on Hull.', 'assumed'],
    ['Machine Names master (Dept, Area, Product Type)', '12, 15', '2', 'Hull file (no access yet). Ask if one common list exists for all sites.', 'assumed'],
    ['Shift Pattern', '16', '1', 'Mapping for Yellow, Shift 1 and Shift 2.', 'assumed'],
    ['Format List', 'none on this page (By Format page)', '0', 'Hull file seen. Mapping for the B2 product names.', 'none'],
    ['Equipment Coding', 'none on this page (Maintenance page)', '0', 'Hull file: access needed.', 'none'],
  ];
  first.forEach(([a, b, c, d, level], i) => {
    const y = 1822 + i * 50;
    [a, b, c, d].forEach((t, j) => pl.box(cols[j], y, widths[j], 42, esc(t), level, 'verticalAlign=middle;fontSize=10.5;'));
  });
  pages.push(pl);
}

// ---- Page: the three options as flow charts -----------------------------------------------------
{
  const fp = new Page('Explanation Three options flow charts');
  fp.text(40, 20, 1500, 30, bold('The three options as flow charts: how it works, what Reckitt must do, and the tests'), 'fontSize=18;');
  fp.box(40, 62, 1520, 56, esc('Read each chart from left to right. Each row is one actor. A purple step is done by Reckitt. A diamond is a test: if it fails, the chart ends in a fallback. Status 2026-10-14: only option 3 is tested.'), 'neutral', 'verticalAlign=top;spacingTop=6;fontSize=11;');
  // Legend
  const leg = [['file', 'Reckitt must do'], ['sih', 'Our step (VFC, script)'], ['empty', 'Test (diamond): can fail'], ['pbi', 'Data lake result'], ['ok', 'Already tested'], ['neutral', 'Event or note']];
  leg.forEach(([lv, tx], i) => fp.box(40 + i * 255, 132, 240, 34, esc(tx), lv, 'verticalAlign=middle;fontSize=10.5;'));
  const LANE_H = 130;
  const STEP_X = 176;
  const KIND = {
    reckitt: ['file', ''],
    ours: ['sih', ''],
    test: ['empty', 'shape=rhombus;perimeter=rhombusPerimeter;rounded=0;align=center;spacingLeft=18;spacingRight=18;'],
    lake: ['pbi', ''],
    done: ['ok', ''],
    event: ['neutral', ''],
    fallback: ['none', 'dashed=1;'],
  };
  function flow(top, title, lanes, nodes, edges) {
    fp.text(40, top, 1500, 24, bold(title), 'fontSize=14;');
    const y0 = top + 36;
    lanes.forEach((name, i) => {
      fp.box(160, y0 + i * LANE_H, 1400, LANE_H - 6, '', 'neutral', 'fillColor=#fafafa;strokeColor=#cccccc;dashed=1;');
      fp.box(40, y0 + i * LANE_H, 112, LANE_H - 6, bold(name), 'neutral', 'verticalAlign=middle;fontSize=10.5;fillColor=#eeeeee;');
    });
    const ids = {};
    nodes.forEach((n) => {
      const [level, extra] = KIND[n.kind];
      const w = 136;
      const h = n.kind === 'test' ? 100 : 84;
      const x = 172 + n.col * STEP_X;
      const y = y0 + n.lane * LANE_H + (LANE_H - 6 - h) / 2;
      ids[n.k] = fp.box(x, y, w, h, esc(n.text), level, `verticalAlign=middle;fontSize=10;${n.kind === 'test' ? '' : 'align=left;'}${extra}`);
    });
    edges.forEach(([a, b, label, fail]) => fp.edge(ids[a], ids[b], fail ? '#b85450' : '#555555', !!fail, label || ''));
    return y0 + lanes.length * LANE_H;
  }

  // Option 1: Power Automate
  let y = flow(190, 'Option 1: Power Automate sends the files to our VFC', ['Reckitt (SharePoint, Power Automate)', 'Our VFC', 'Data lake'], [
    { k: 'a1', lane: 0, col: 0, kind: 'reckitt', text: 'Reckitt builds one flow per file type. Trigger: file created or changed in the folder' },
    { k: 't1', lane: 0, col: 1, kind: 'test', text: 'TEST A: premium licence needed for HTTP?' },
    { k: 'a2', lane: 0, col: 2, kind: 'reckitt', text: 'Reckitt adds an HTTP POST to our endpoint (address and key come from us)' },
    { k: 'a3', lane: 0, col: 3, kind: 'event', text: 'A file is saved or changed in SharePoint' },
    { k: 'v1', lane: 1, col: 3, kind: 'ours', text: 'VFC http in node receives the file and checks the key' },
    { k: 't2', lane: 1, col: 4, kind: 'test', text: 'TEST B: size up to 6.5 MB accepted?' },
    { k: 't3', lane: 1, col: 5, kind: 'test', text: 'TEST C: UTF-16 decoded in a function node?' },
    { k: 'v2', lane: 1, col: 6, kind: 'ours', text: 'VFC cleans the file: tab, quotes, Total row, column names' },
    { k: 'l1', lane: 2, col: 6, kind: 'lake', text: 'Parquet file in the data lake, date in the name' },
    { k: 'v3', lane: 1, col: 7, kind: 'ours', text: 'Log line. A heartbeat raises an alert if no file came for N days' },
    { k: 'f0', lane: 1, col: 1, kind: 'fallback', text: 'Licence needed: ask Reckitt for it, or choose option 2 or 3' },
    { k: 'f1', lane: 2, col: 4, kind: 'fallback', text: 'Fallback: option 2 or 3. Or ask for smaller files' },
    { k: 'f1b', lane: 2, col: 5, kind: 'fallback', text: 'Fallback: ask for a UTF-8 export, or convert in the flow' },
  ], [
    ['a1', 't1'],
    ['t1', 'a2', 'ok'],
    ['t1', 'f0', 'fail', true],
    ['a2', 'a3'],
    ['a3', 'v1'],
    ['v1', 't2'],
    ['t2', 't3', 'pass'],
    ['t2', 'f1', 'fail', true],
    ['t3', 'v2', 'pass'],
    ['t3', 'f1b', 'fail', true],
    ['v2', 'l1'],
    ['v2', 'v3'],
  ]);

  // Option 2: direct access
  y = flow(y + 40, 'Option 2: the VFC reads SharePoint directly (Microsoft Graph)', ['Reckitt IT', 'Our VFC', 'Data lake'], [
    { k: 'a1', lane: 0, col: 0, kind: 'reckitt', text: 'IT creates an app registration or a service account with read access to the folders of all sites' },
    { k: 'a2', lane: 0, col: 1, kind: 'reckitt', text: 'IT gives us client ID, secret and tenant ID in a safe way (never in documents)' },
    { k: 'a3', lane: 0, col: 2, kind: 'event', text: 'Approval time is not known: the slowest step' },
    { k: 't1', lane: 1, col: 2, kind: 'test', text: 'TEST A: VFC reaches Microsoft login and Graph?' },
    { k: 'v1', lane: 1, col: 3, kind: 'ours', text: 'VFC gets a token (http request node)' },
    { k: 't2', lane: 1, col: 4, kind: 'test', text: 'TEST B: permission covers every folder?' },
    { k: 'v2', lane: 1, col: 5, kind: 'ours', text: 'VFC lists the folders and finds new or changed files (modified date)' },
    { k: 'v3', lane: 1, col: 6, kind: 'ours', text: 'VFC downloads the file and cleans it' },
    { k: 'l1', lane: 2, col: 6, kind: 'lake', text: 'Parquet file in the data lake, date in the name' },
    { k: 'v4', lane: 1, col: 7, kind: 'ours', text: 'Log line. Runs on a schedule (daily or hourly)' },
    { k: 'f1', lane: 2, col: 2, kind: 'fallback', text: 'Fallback: ask IT to open the host, or use option 1 or 3' },
    { k: 'f2', lane: 2, col: 4, kind: 'fallback', text: 'Fallback: ask IT to widen the permission scope' },
  ], [
    ['a1', 'a2'],
    ['a2', 'a3'],
    ['a3', 't1'],
    ['t1', 'v1', 'pass'],
    ['t1', 'f1', 'fail', true],
    ['v1', 't2'],
    ['t2', 'v2', 'pass'],
    ['t2', 'f2', 'fail', true],
    ['v2', 'v3'],
    ['v3', 'l1'],
    ['v3', 'v4'],
  ]);

  // Option 3: manual copy
  flow(y + 40, 'Option 3: manual copy (interim, works today)', ['User', 'Reckitt', 'Data lake and project folder'], [
    { k: 'u1', lane: 0, col: 0, kind: 'ours', text: 'User opens the folder in the browser' },
    { k: 't1', lane: 0, col: 1, kind: 'test', text: 'TEST: access to the folder?' },
    { k: 'r1', lane: 1, col: 1, kind: 'reckitt', text: 'Reckitt grants access to the folder (someone must approve)' },
    { k: 'u2', lane: 0, col: 3, kind: 'ours', text: 'User downloads file by file with a real click' },
    { k: 't2', lane: 0, col: 4, kind: 'test', text: 'TEST: file complete? (size, last row)' },
    { k: 'u3', lane: 0, col: 5, kind: 'ours', text: 'Converter script cleans the file (not built yet)' },
    { k: 'u4', lane: 0, col: 6, kind: 'ours', text: 'User puts the parquet file in the data lake' },
    { k: 'l1', lane: 2, col: 6, kind: 'lake', text: 'Parquet file in the lake, date in the name, MANIFEST updated' },
    { k: 'n1', lane: 0, col: 7, kind: 'event', text: 'Repeat when the files change. Class B (hourly) goes stale' },
    { k: 'd1', lane: 2, col: 3, kind: 'done', text: 'TESTED 2026-10-14: 36 files downloaded, all complete (sizes and last rows checked)' },
    { k: 'f1', lane: 2, col: 4, kind: 'fallback', text: 'Fallback: download again, or ask for the file by mail' },
  ], [
    ['u1', 't1'],
    ['t1', 'u2', 'yes'],
    ['t1', 'r1', 'no access', true],
    ['r1', 'u2', 'when granted'],
    ['u2', 't2'],
    ['t2', 'u3', 'pass'],
    ['t2', 'f1', 'fail', true],
    ['u3', 'u4'],
    ['u4', 'l1'],
    ['u4', 'n1'],
  ]);
  pages.push(fp);
}

// ---- Page for the tables not created -----------------------------------------------------------
const nc = new Page('Not created yet');
nc.text(40, 20, 1500, 30, bold('Power BI tables not created from Insights Hub yet'), 'fontSize=18;');
nc.text(
  40,
  58,
  1500,
  44,
  'Columns are those of the Power BI model. The status says what the table needs. Group 2 = shift KPIs, run rate (decide later); group 3 = files that need an integration (Glidepaths, Format Mapping, Equipment Coding, Volume Loss Correction). Not analysed in the model: Handover, Shift Colours, Master Mode Comment and Full Site Shift Performance are read by visuals but are not tables of the template.',
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
    esc('SIH source: ' + (NC_SIH[t.pbi] ?? 'none')),
    esc(t.note ?? ''),
    t.hidden ? esc('Hidden table: not shown in the Data pane') : '',
  ].filter(Boolean);
  const x = 40 + col * 510;
  const hHead = 200 + (t.note ? 20 : 0);
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
