// Builds diagrams/site-dashboards-map.drawio: the current data map of the
// one Tableau workbook (EU and site dashboards) for the discussion with
// Segun and the team. Pages: agreed pages, current map (overview and one
// page per table), the EU scope idea, SIH coverage, decisions, parked
// differences, then the still-valid explanation pages of the old
// diagrams/powerbi-data-map.drawio (a snapshot of 2026-10-13/15) as
// "Background" pages.
// Inputs: our table schemas (lib-pbi-report-schemas.js),
// diagrams/data/site-column-usage.json (scripts/helper-site-column-usage.js)
// and diagrams/data/eu-extract-profile.json (scripts/helper-profile-parquet.py
// on Segun's extracts in downloads/eu_oee_latest).
// Text source: prompt-response/site-dashboards-analysis.md
// Usage: node scripts/build-drawio-site-dashboards.js
import { readFileSync, writeFileSync } from 'node:fs';
import {
  reportPlanSchema, reportUtilSchema, reportLossSchema,
} from './lib-pbi-report-schemas.js';

const OUTPUT = 'diagrams/site-dashboards-map.drawio';
const REFERENCE = 'diagrams/powerbi-data-map.drawio';
const USAGE = JSON.parse(readFileSync('diagrams/data/site-column-usage.json', 'utf8'));
const PROFILE = JSON.parse(readFileSync('diagrams/data/eu-extract-profile.json', 'utf8'));

// Old explanation pages that are still valid, with what changed since.
const BACKGROUND = [
  ['Explanation Targets (Glidepaths)', 'Targets (Glidepaths)', 'Since then: the targets are filled from the regional Glidepaths files in the lake (eu_report/reference/glidepaths). The site files differ: Hull V7 (524 cells in 2026), Nottingham keeps downtime targets as fractions. Tableau divides all targets by 100. Glidepaths change during the year (D7).'],
  ['Explanation Format List', 'Format List', 'Since then: Format_List_EU is proposed (C4); it is used only by By Format Breakdown. Nottingham has no file yet (D4); SIH product names need a mapping (D12).'],
  ['Explanation Shift names', 'Shift names', 'Since then: ShiftName holds the mapped shift from the regional Shift Patterns file (Hull: the colour). SIH calendar names are the colours too; a few calendars use other names (parked).'],
  ['Explanation Machine Names', 'Machine Names', 'Since then: Machine Names is a lookup, not a table: Dept, Area and Product Type are joined into every table. Idea C1: lookup unfiltered, EU scope as a column.'],
  ['Explanation Equipment Coding', 'Equipment Coding', 'Since then: used by the Provideam build only; SIH rows take the reason sub group as Equipment.'],
  ['Explanation Loss Units', 'Loss Units', 'Since then: Provideam rows take Loss Units from Volume Loss Correction; SIH rows use design speed x stop minutes, and their Time in Mins is the stop minutes (Loss in CUs = Loss Units).'],
  ['Explanation Provideam vs Insights Hub', 'Provideam vs Insights Hub', 'Since then: the full, current list is the page "Parked: SIH vs Provideam differences".'],
  ['Explanation Data collection and conflicts', 'Data collection and conflicts', 'Since then: the files are copied by hand to the lake (eu_report/reference, eu_report/pbi_report/source); the listener rebuilds the tables when a file changes.'],
];

// ---- Levels and colours ----------------------------------------------------
const LEVEL = {
  have: { fill: '#d5e8d4', stroke: '#82b366', label: 'OURS TODAY' },
  change: { fill: '#fff2cc', stroke: '#d6b656', label: 'OURS + EU SCOPE COLUMN (IDEA C1)' },
  table: { fill: '#ffe6cc', stroke: '#d79b00', label: 'NEW TABLE FROM FILES WE HOLD' },
  archive: { fill: '#e1d5e7', stroke: '#9673a6', label: 'ONE-TIME ARCHIVE' },
  source: { fill: '#dae8fc', stroke: '#6c8ebf', label: 'NEW FILE OR INPUT (RECKITT)' },
  none: { fill: '#f8cecc', stroke: '#b85450', label: 'NOT AVAILABLE' },
  neutral: { fill: '#ffffff', stroke: '#666666', label: '' },
  grey: { fill: '#f5f5f5', stroke: '#666666', label: '' },
};
// Column status on the table pages.
const STATUS = {
  ok: { fill: '#d5e8d4', stroke: '#82b366', label: 'OK ON BOTH SOURCES' },
  ref: { fill: '#dae8fc', stroke: '#6c8ebf', label: 'FROM A REFERENCE FILE' },
  sih: { fill: '#f8cecc', stroke: '#b85450', label: 'SIH ROWS DIFFER OR EMPTY' },
  idea: { fill: '#fff2cc', stroke: '#d6b656', label: 'IDEA (FOR DISCUSSION)' },
  new: { fill: '#ffe6cc', stroke: '#d79b00', label: 'NEW TABLE (PROPOSED)' },
  unused: { fill: '#f5f5f5', stroke: '#999999', label: 'NOT USED BY AN AGREED PAGE' },
};
Object.assign(LEVEL, Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [`st_${k}`, v])));

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
  ['Not built', 'By Shift Breakdown', 'By Shift Breakdown', 'Common build', 'table', 'Run_Rates_EU and Volume_CoV_EU (new): average run rate, % Adherence, CoV per shift'],
  ['Not built', 'By Format Breakdown', 'By Format Breakdown', 'Common build', 'source', 'Run_Rates_EU and Format_List_EU (new); Nottingham Format List file missing (D4)'],
  ['Not built', 'OEE Trending', 'OEE Trending', 'Common build', 'change', 'OEE against target by year, month, week, line, department'],
  ['Not built', 'Historical OEE', 'Historical OEE', 'Common build', 'archive', 'Historical_OEE_EU (new): Jan 2022 to Nov 2024 (old method), simple average of daily OEE'],
  ['Not built', 'Loss Tree', 'Monthly breakdown', 'Common build', 'change', 'Same measures, two layouts: 14 periods (Nottingham) or year x month x week (Hull)'],
  ['Not built', 'Unplanned Loss Tree', 'Unplanned Losses (frequency)', 'Common build, grouping to confirm', 'change', 'Hours by sub group x stop and x equipment / stop counts'],
  ['Not built', 'Volume Trending', '-', 'Separate Nottingham build', 'source', 'Good parts of packing lines only; volume target is a hard-coded number (D6)'],
  ['Not built', '-', 'OEE/LOSS GRAPH', 'Separate Hull build', 'change', 'Weekly OEE against unplanned Loss %'],
];

// ---- Content: EU scope (idea C1) ------------------------------------------------
const RULES = [
  ['Hull, every table', 'EU drops the 19 machines whose Dept is Dries Process or Liquids Process (4 Tonne, 6 Tonne, 6000L, GG4 to GG7, Lemsip Process, Senokot Press...). One rule: Dept is Dries Pack or Liquids Pack'],
  ['Nottingham, Plan OPT', 'EU keeps areas SD Packing and " Strepsils Packing" (leading space), not S14: 24 machines'],
  ['Nottingham, Time Utilisation', 'EU keeps a fixed list of 23 machines: the same as Plan OPT minus T1 (looks like an oversight)'],
  ['Nottingham, Daily losses', 'EU drops only 9 names (Bosch, Fette 23, Fette12, Fette2, Fette20, Fette4, Fette5, Gran0, S14): 33 of the 41 non-packing machines stay in the rows, but not in EU Machine Names'],
  ['Nottingham, Volume CoV / Run Rates', 'EU drops 14 process names (28 non-packing machines stay) / only S14'],
  ['Nottingham, Machine Names', 'EU keeps the two packing areas: 25 of 66 machines'],
];
const KEPT = 'Dropped in both reports, stays in the build: Nottingham N11 Auto (plan side), B1 - Auto, B4 Auto, B5 Auto (losses); Hull GT4 - Auto. Rows are dropped by machine only, never by product.';
// [option, how, for, against]
const SCOPE_OPTIONS = [
  ['A. Rule per site in Config (on Machine Names columns)', 'Nottingham: Area is SD Packing or Strepsils Packing, except S14. Hull: Dept is Dries Pack or Liquids Pack', 'No file changes; a new machine is classified by its Area / Dept automatically; SIH rows follow the same lookup', 'The rule lives with us, not with Reckitt'],
  ['B. Column In EU Report in the Machine Names file', 'One Y/N per machine in the site file', 'Clear, one row per machine, owned by the site', 'The file is Reckitt\'s (SharePoint): our copy is overwritten unless Reckitt adds the column'],
  ['C. Own scope list in eu_report/reference', 'MachineName, In EU Report per site', 'Explicit, ours', 'One more file to keep in step with Machine Names'],
];

// ---- Content: sources, build, tables, pages (overview) -----------------------
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
  ['pbi', 'have', 'PBI report build tab (164 of 200 nodes)', 'existing lanes + idea C1; new lanes: Run Rates, Volume CoV, Format List job'],
  ['sihb', 'have', 'Hull SIH report daily tab (195 of 200 nodes)', 'writes the same 3 tables; Run Rates output does not fit: new tab or split (D9)'],
  ['once', 'archive', 'One-time conversion + upload', 'archive never changes; no flow'],
];
const TABLE_BOXES = [
  ['t1', 'change', 'Plan_OPT_EU', '+ In EU Report (idea)'],
  ['t2', 'change', 'Time_Utilisation_EU', '+ In EU Report (idea)'],
  ['t3', 'change', 'Daily_Losses_EU', '+ In EU Report (idea)'],
  ['t4', 'table', 'Run_Rates_EU (new)', 'hour x machine x part'],
  ['t5', 'table', 'Volume_CoV_EU (new)', 'day x shift x machine, groups over 1,000 parts'],
  ['t6', 'source', 'Format_List_EU (new)', 'machine + product: brand, size, count'],
  ['t7', 'archive', 'Historical_OEE_EU (new)', 'machine x day, OEE / A / P'],
];
const PAGE_GROUPS = [
  ['g1', 'have', 'EU pages (4)', 'EU-Level and Site-Level Overview, Planned and Unplanned Losses: filter In EU Report = true'],
  ['g2', 'have', 'Site pages on the 3 tables (12)', 'Homepage, VSU pages, losses pages, L2/L3, Loss Trending, Maintenance, OEE Trending, Loss Tree, Unplanned Loss Tree, Volume Trending, Hull pages'],
  ['g3', 'table', 'By Shift Breakdown', 'run rate per shift, CoV, OEE per shift'],
  ['g4', 'source', 'By Format Breakdown', 'OEE and losses by brand and format, run rates by SKU'],
  ['g5', 'archive', 'Historical OEE', 'average OEE 2022 to 2024'],
];
// [from, to]
const FLOWS = [
  ['plan', 'pbi'], ['loss', 'pbi'], ['rr', 'pbi'], ['ref', 'pbi'], ['fmt', 'pbi'],
  ['ref', 'sihb'], ['sih', 'sihb'], ['hist', 'once'],
  ['pbi', 't1'], ['pbi', 't2'], ['pbi', 't3'], ['pbi', 't4'], ['pbi', 't5'], ['pbi', 't6'],
  ['sihb', 't1'], ['sihb', 't2'], ['sihb', 't3'], ['once', 't7'],
  ['t1', 'g1'], ['t3', 'g1'], ['t1', 'g2'], ['t2', 'g2'], ['t3', 'g2'],
  ['t4', 'g3'], ['t5', 'g3'], ['t4', 'g4'], ['t6', 'g4'], ['t7', 'g5'],
];

// ---- Content: the table pages --------------------------------------------------
// Columns used to join, not shown by a page.
const KEYS = new Set(['Date', 'MachineName', 'SiteName', 'Unique Machine Name', 'ShiftStartDate', 'Product Key', 'Site Name']);
// Usage taken from a lookup instead of the table itself.
const LOOKUP_USE = {
  Dept: ['Machine Names (lookup)', 'Dept'],
  'Product Type': ['Machine Names (lookup)', 'Product Type'],
  ShiftName: ['Shift (lookup)', 'Shift'],
  'Shift Time': ['Shift (lookup)', 'Shift'],
  Shift: ['Shift (lookup)', 'Shift'],
};
const IDEA = ['In EU Report', 'BOOLEAN', 'report scope file config/report_scope.csv (built 2026-10-27)', 'true (SIH lines are packing lines)', 'new'];
const NEW_COMMON = {
  Dept: ['Machine Names lookup', 'Machine Names lookup', 'ref'],
  Area: ['Machine Names lookup', 'Machine Names lookup', 'ref'],
  'Product Type': ['Machine Names lookup', 'Machine Names lookup', 'ref'],
  'Data Source': ['Provideam', 'SIH', 'new'],
  SiteName: ['site of the file', 'site of the Config line', 'new'],
  'Unique Machine Name': ['MachineName-Site', 'MachineName-Site', 'new'],
};
// Per table: [column, type, Provideam rule, SIH rule, status]. The three
// existing tables take their column list from the schemas; text from INFO.
const INFO = {
  Plan_OPT_EU: {
    Date: ['production day of the export', 'production day, local (dayStartLocal)', 'ok'],
    AreaName: ['export AreaName (e.g. Hull Liquids)', 'empty (no Provideam area in SIH)', 'sih'],
    MachineName: ['export MachineName', 'report name of the Config line (B2 Line = B2 Auto)', 'ok'],
    ShiftName: ['export shift mapped by Shift Patterns (Hull: colour)', 'calendar event name (colours); a few calendars use other names', 'sih'],
    PartName: ['export PartName (spaces kept)', 'product description, else name (differs from Provideam part names)', 'sih'],
    'Good Parts': ['export', 'KPI good parts per hour, summed, rounded', 'ok'],
    Capacity: ['export', 'design speed per minute x minutes (depends on the SIH design speeds)', 'sih'],
    'Total Time': ['export H:MM:SS as minutes', 'KPI ms cut to whole minutes', 'ok'],
    'Planned OpT': ['export H:MM:SS as minutes', 'KPI ms cut to whole minutes', 'ok'],
    'OEE Time': ['export H:MM:SS as minutes', 'KPI ms cut to whole minutes', 'ok'],
    'Downtime Units': ['export', 'design speed x downtime minutes', 'ok'],
    SiteName: ['site of the file', 'site of the Config line', 'ok'],
    'Unique Machine Name': ['MachineName-Site', 'MachineName-Site', 'ok'],
    'Product Key': ['Unique Machine Name + space + PartName', 'the same with the SIH part name', 'ok'],
    'UPDT Target': ['Glidepaths, by unique name and month (percent: / 100 in Tableau)', 'the same', 'ref'],
    'PDT Target': ['Glidepaths, by unique name and month (percent: / 100 in Tableau)', 'the same', 'ref'],
    'OEE Target': ['Glidepaths, by unique name and month (percent: / 100 in Tableau)', 'the same', 'ref'],
    Dept: ['Machine Names lookup', 'Machine Names lookup', 'ref'],
    Area: ['Machine Names lookup', 'Machine Names lookup', 'ref'],
    'Product Type': ['Machine Names lookup', 'Machine Names lookup', 'ref'],
    'Data Source': ['Provideam', 'SIH', 'ok'],
    source_hours: ['empty', 'hours of data behind the row (ours)', 'ok'],
    loaded_at: ['time written (ours)', 'time written (ours)', 'ok'],
  },
  Time_Utilisation_EU: {
    Date: ['production day', 'production day, local', 'ok'],
    MachineName: ['export MachineName', 'report name of the Config line', 'ok'],
    'OEE Time Total': ['sum of plan minutes per machine and day', 'the same from SIH plan minutes', 'ok'],
    'Total Time Total': ['sum of plan minutes per machine and day', 'the same from SIH plan minutes', 'ok'],
    'Planned OPT Total': ['sum of plan minutes per machine and day', 'the same from SIH plan minutes', 'ok'],
    SiteName: ['site of the file', 'site of the Config line', 'ok'],
    'Unique Machine Name': ['MachineName-Site', 'MachineName-Site', 'ok'],
    'All Time': ['1440', '1440 (also on the 23 and 25 hour days)', 'ok'],
    Dept: ['Machine Names lookup', 'Machine Names lookup', 'ref'],
    Area: ['Machine Names lookup', 'Machine Names lookup', 'ref'],
    'Product Type': ['Machine Names lookup', 'Machine Names lookup', 'ref'],
    'Data Source': ['Provideam', 'SIH', 'ok'],
    loaded_at: ['time written (ours)', 'time written (ours)', 'ok'],
  },
  Daily_Losses_EU: {
    Date: ['date of the stop', 'local date of the stop', 'ok'],
    Time: ['time of the stop', 'time of the stop (ms of the day)', 'ok'],
    MachineName: ['export MachineName', 'report name of the Config line', 'ok'],
    PartName: ['export PartDesc', 'product of the hour', 'sih'],
    'Shift Time': ['mapped by Shift Patterns', 'calendar event name', 'sih'],
    ShiftName: ['mapped by Shift Patterns (Hull: colour)', 'calendar event name', 'sih'],
    OEELossLvl3Group: ['export group (Planned Loss, Unplanned Loss, Not Logged)', 'group of the SIH reason', 'sih'],
    OEELossLvl3SubGroup: ['export sub group, renamed to the common list', 'reason category; Not Logged when empty (68 % of stops)', 'sih'],
    OEELossLvl3Desc: ['operator reason (e.g. Reel Change)', 'machine alarm text', 'sih'],
    Duration: ['H:MM:SS of the export', 'stop minutes from downtimeReasons', 'ok'],
    SiteName: ['site of the file', 'site of the Config line', 'ok'],
    'Unique Machine Name': ['MachineName-Site', 'MachineName-Site', 'ok'],
    'Breakdown Types': ['sub group before Breakdown was merged (Electrical / Mechanical)', 'from the SIH reason', 'sih'],
    ShiftStartDate: ['date of the shift start', 'production day', 'ok'],
    Comment: ['operator comment of the export', 'empty: SIH gives a comment count only (deep dive, D10)', 'sih'],
    'Product Key': ['Unique Machine Name + space + PartName', 'the same with the SIH part name', 'ok'],
    'Volume Key': ['built key (date, machine, group, sub, desc)', 'built the same way', 'ok'],
    'Loss Units': ['Volume Loss Correction lookup', 'design speed x stop minutes', 'sih'],
    'Time in Mins': ['Volume Loss Correction lookup', 'stop minutes (so Loss in CUs = Loss Units)', 'ok'],
    'Equipment Loss Key': ['machine + desc', 'machine + desc', 'ok'],
    Equipment: ['Equipment Coding lookup (Unclassed if none)', 'reason sub group (Unclassed if none)', 'sih'],
    'Lvl 3 Loss Name': ['Equipment Coding lookup', 'the stop text', 'sih'],
    'Loss Target Key': ['unique name + sub group + month', 'the same', 'ok'],
    Value: ['Glidepaths bucket of the sub group and month', 'only where the SIH category has a report sub group name', 'sih'],
    'Volume Total': ['sum of plan Capacity per machine and day', 'the same from SIH plan rows', 'ok'],
    'Loss Final Level': ['= OEELossLvl3Desc', 'as SIH gives it', 'sih'],
    Dept: ['Machine Names lookup', 'Machine Names lookup', 'ref'],
    Area: ['Machine Names lookup', 'Machine Names lookup', 'ref'],
    'Product Type': ['Machine Names lookup', 'Machine Names lookup', 'ref'],
    'Data Source': ['Provideam', 'SIH', 'ok'],
    target: ['Value / 100 (ours)', 'Value / 100 (ours)', 'ok'],
    batch_id: ['empty', 'order of the hour (ours)', 'ok'],
    comment_count: ['empty', 'comment count of the stop (ours)', 'ok'],
    loaded_at: ['time written (ours)', 'time written (ours)', 'ok'],
  },
};
const NEW_TABLES = {
  Run_Rates_EU: {
    title: 'Run_Rates_EU (built 2026-10-27, tab PBI report build 2)',
    about: 'One row per hour, machine and part. Provideam: the Run Rates month export, normalizer type run_rates. Rules from the EU query: no machine out, Good Parts = 0 out, shift mapped by Shift Patterns, Weinheim part code cut. Checked against the EU table: 99.4 % of rows matched. SIH: not built yet (D9, the SIH tab is full).',
    cols: [
      ['Date', 'TIMESTAMP', 'export hour (YYYY-MM-DD HH)', 'KPI hour'],
      ['AreaName', 'UTF8', 'export AreaName', 'empty'],
      ['MachineName', 'UTF8', 'export MachineName', 'report name of the Config line'],
      ['PartName', 'UTF8', 'export PartName', 'product of the hour'],
      ['ShiftName', 'UTF8', 'mapped by Shift Patterns', 'calendar event name'],
      ['Good Parts', 'INT64', 'export (rows with 0 dropped)', 'KPI good parts of the hour'],
      ['Capacity', 'DOUBLE', 'export', 'design speed per minute x minutes of the hour'],
      ['SiteName', 'UTF8'],
      ['Unique Machine Name', 'UTF8'],
      ['Product Key', 'UTF8', 'Unique Machine Name + space + PartName', 'the same'],
      ['Good Parts - Copy', 'INT64', 'Good Parts (as the EU table)', 'the same'],
      ['Dept', 'UTF8'], ['Area', 'UTF8'], ['Product Type', 'UTF8'], ['Data Source', 'UTF8'],
    ],
  },
  Volume_CoV_EU: {
    title: 'Volume_CoV_EU (built 2026-10-27, tab PBI report build 2)',
    about: 'One row per day, shift and machine, built from the plan OPT month files: only groups with more than 1,000 good parts (Hull groups on the mapped shift, the other sites on the raw shift name). Checked against the EU table: 99.7 % of rows matched. In Tableau: Capacity Checker = Good Parts Sum > 0.7 x Cap Max, AVG Volume, CoV Aggregate = STDEV / AVG.',
    cols: [
      ['Date', 'DATE', 'plan date', 'plan date'],
      ['Shift', 'UTF8', 'mapped shift of the plan rows', 'the same'],
      ['MachineName', 'UTF8', 'plan MachineName', 'the same'],
      ['Good Parts Sum', 'DOUBLE', 'sum of Good Parts', 'the same'],
      ['Cap Max', 'DOUBLE', 'max Capacity', 'the same'],
      ['Shift Machine Key', 'UTF8', 'Shift + space + MachineName', 'the same'],
      ['Unique Machine Name', 'UTF8'], ['SiteName', 'UTF8'],
      ['Dept', 'UTF8'], ['Area', 'UTF8'], ['Product Type', 'UTF8'], ['Data Source', 'UTF8'],
    ],
  },
  Format_List_EU: {
    title: 'Format_List_EU (built 2026-10-27, tab PBI report build 2)',
    about: 'One row per machine and product, from the reference Format List files (Hull, Weinheim, Mira; equal to the EU table). NOTTINGHAM HAS NO FILE: starter list with node scripts/helper-format-list-starter.js Nottingham (D4). For SIH lines the Product Name must be the SIH product name (D12).',
    cols: [
      ['Site Name', 'UTF8', 'file', 'file'],
      ['MachineName', 'UTF8', 'file', 'file'],
      ['Product Name', 'UTF8', 'file (Provideam part name)', 'needs the SIH product name (D12)'],
      ['Brand', 'UTF8', 'file', 'file'],
      ['Unit Size', 'UTF8', 'file', 'file'],
      ['Unit Count/Format', 'UTF8', 'file', 'file'],
      ['Extra Info', 'UTF8', 'file', 'file'],
      ['Unique Machine Name', 'UTF8', 'MachineName-Site', 'the same'],
      ['Product Key', 'UTF8', 'Unique Machine Name + space + Product Name', 'the same'],
    ],
  },
  Historical_OEE_EU: {
    title: 'Historical_OEE_EU (converted 2026-10-27, upload by the user)',
    about: 'One row per machine and day, Jan 2022 to Nov 2024 (Hull to Oct 2024), old OEE method, from the two archive files: 71,345 rows. Never changes: one conversion (scripts/historical-oee-convert.js) and upload (scripts/historical-oee-upload.js), no flow. The page shows a simple average of daily OEE.',
    cols: [
      ['Date', 'DATE', 'archive YYYY-MM-DD', 'none (before SIH)'],
      ['MachineName', 'UTF8', 'archive (old machines kept)', 'none'],
      ['SiteName', 'UTF8', 'site of the file', 'none'],
      ['Unique Machine Name', 'UTF8', 'MachineName-Site', 'none'],
      ['OEE', 'DOUBLE', 'archive % as a fraction', 'none'],
      ['Availability', 'DOUBLE', 'archive % as a fraction', 'none'],
      ['Performance', 'DOUBLE', 'archive % as a fraction', 'none'],
      ['Dept', 'UTF8', 'Machine Names lookup (empty for old machines)', 'none'],
      ['Area', 'UTF8', 'Machine Names lookup', 'none'],
      ['Product Type', 'UTF8', 'Machine Names lookup', 'none'],
      ['Data Source', 'UTF8', 'Provideam archive', 'none'],
      ['In EU Report', 'BOOLEAN', 'report scope file (no rule: true)', 'none'],
    ],
  },
};

// ---- Content: SIH coverage -------------------------------------------------------
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

// ---- Content: decisions -------------------------------------------------------------
// [id, group, decision, who, recommendation, note of the user (2026-10-23)]
const DECISIONS = [
  ['D1', 'segun', 'Idea: the EU filters become a column In EU Report; Machine Names lookup unfiltered. Where the scope lives (Config rule, Machine Names column, own file) and one rule per machine instead of today\'s per-table rules', 'User, Segun, then Reckitt', 'Config rule on Area / Dept; accept the small EU changes of one rule per machine', 'AGREED 2026-10-27, BUILT: own file config/report_scope.csv (today\'s per-table rules, EU numbers unchanged), shown on the Configuration tab of the run monitor'],
  ['D2', 'segun', 'New tables Run_Rates_EU and Volume_CoV_EU in the PBI report build', 'User, Segun', 'Yes; Run Rates from Aug 2026 unless more history is needed', 'AGREED, BUILT 2026-10-27 in a second tab PBI report build 2 (the first tab is at 176 of 200 nodes after the scope lane)'],
  ['D3', 'segun', 'New table Format_List_EU from the reference Format List files', 'User, Segun', 'Yes', 'AGREED, BUILT (Hull first). Nottingham has no Format List file: remember to ask'],
  ['D5', 'segun', 'Historical OEE as a one-time upload; simple average in Tableau', 'User, Segun', 'Yes', 'AGREED, converted locally 2026-10-27; the user uploads after a look'],
  ['D8', 'segun', 'Hull Availability / Performance gauges (Hull Homepage only)', 'User, Segun, Reckitt', 'Skip for now; SIH has the values', ''],
  ['D9', 'segun', 'Run Rates for SIH lines', 'User', 'Yes with D2; the Hull SIH tab is full (195 of 200 nodes): a second tab or a split', ''],
  ['D13', 'segun', 'EU and site views in one workbook: In EU Report, S14 (VSU) and packing-only filters', 'Segun', 'Page filters in Tableau', ''],
  ['D4', 'reckitt', 'Nottingham Format List: who fills it', 'Reckitt (Nottingham)', 'We make the starter list (machine + part names), Nottingham fills brand, size, count', 'Starter ready: helper-format-list-starter.js Nottingham (584 machine + part pairs). Ask Nottingham again'],
  ['D6', 'reckitt', 'Volume target: source and grain', 'Reckitt', 'Tableau parameter until a source exists', ''],
  ['D7', 'reckitt', 'Hull glidepath master: regional file (used now) or site V7 file (524 cells differ in 2026)', 'Reckitt (Hull)', 'Keep the regional file meanwhile', 'Glidepaths are updated during the year (Nottingham): agree who updates which file and how it reaches the lake'],
  ['D12', 'reckitt', 'Format List for SIH lines: SIH product names against Provideam part names', 'Reckitt, user', 'A mapping per line when it switches', ''],
  ['D10', 'later', 'Comment text for SIH lines (only a count exists)', 'User, then Reckitt / Siemens', 'Accept empty comments for now', 'Look deeper in a separate session'],
  ['D11', 'later', 'SIH loss tree to report groups and sub groups', 'User, then Reckitt', 'Needed before a line switches for the loss pages', 'SIH has a loss tree; find out why stops do not map to it (68 % without category)'],
  ['D14', 'later', 'Parked differences (page "Parked"): escalate when the setup is finished', 'User, then Reckitt', 'Keep one register; escalate per line before it switches', 'Known, ignored on purpose until the SIH setup is finished'],
];
const GROUPS = [
  ['segun', 'Decide with Segun and the team'],
  ['reckitt', 'Ask Reckitt'],
  ['later', 'Deep dive later / parked'],
];

// ---- Content: parked differences ------------------------------------------------------
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
    page.box(x, top, 260, 30, bold(LEVEL[key].label), key);
    top += 40;
  }
  return top;
}

// One table row of boxes with a shared height. cols: [width, html, level, plain]
function row(page, x, y, cols, minHeight = 30) {
  const h = Math.max(minHeight, ...cols.map(([w, , , plain]) => fit(w, [plain])));
  let left = x;
  for (const [w, html, level] of cols) {
    page.box(left, y, w, h, html, level);
    left += w + 6;
  }
  return y + h + 6;
}

function header(page, x, y, widths, names) {
  return row(page, x, y, names.map((n, i) => [widths[i], bold(n), 'grey', n]));
}

const pages = [];
const newPage = (name) => {
  const p = new Page(name, pages.length);
  pages.push(p);
  return p;
};

// ---- Page: agreed pages ----------------------------------------------------------
const p1 = newPage('Site dashboards: agreed pages');
let title = bold('One workbook: EU and site pages (Nottingham model) and the data each page needs');
title += `<br>${small('Agreed with Reckitt: EU, Nottingham and Hull dashboards become one Tableau workbook. Colour of the last column = what the page needs beyond our tables today.')}`;
title += `<br>${small('Read from the .pbit templates (model and pages) on 2026-10-23. Details: prompt-response/site-dashboards-analysis.md, sections 2.1 and 3.')}`;
p1.text(40, 20, 1300, 70, title);
legend(p1, 1400, 20, ['have', 'change', 'table', 'archive', 'source', 'none']);
const W1 = [210, 170, 200, 220, 460];
let y = header(p1, 40, 110, W1, ['EU dashboard', 'Nottingham', 'Hull', 'Common build', 'Data needed']);
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
note += `<br>${esc('Yellow: the page uses only columns we have, but needs the machines the EU report drops (manufacturing and process machines, S14). See "EU scope (idea C1)".')}`;
note += `<br>${esc('Not needed: Plan OPT ShiftStartTime, Defect Parts, Target, OEE (no page uses them); a raw shift column (the Hull colour is already in ShiftName); a Shift Naming table.')}`;
p1.box(40, y, 1290, 80, note, 'neutral');

// ---- Page: current map overview ---------------------------------------------------
const p3 = newPage('Current map: overview');
title = bold('Current map: sources, where they are built, the tables Tableau reads and the pages that use them');
title += `<br>${small('Tables in eu_report/report/<table>/ hold Provideam and SIH rows side by side (Data Source); a line switches with reportSource in Config. New tables and In EU Report are proposals, nothing built.')}`;
p3.text(40, 20, 1300, 50, title);
legend(p3, 1700, 20, ['have', 'change', 'table', 'archive', 'source']);
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
for (const [key, level, name, detail] of TABLE_BOXES) {
  const h = fit(300, [name, detail]);
  ids[key] = p3.box(960, ty, 300, h, `${bold(name)}<br>${small(detail)}`, level);
  ty += h + 20;
}
let gy = 100;
for (const [key, level, name, detail] of PAGE_GROUPS) {
  const h = fit(300, [name, detail]);
  ids[key] = p3.box(1360, gy, 300, h, `${bold(name)}<br>${small(detail)}`, level);
  gy += h + 40;
}
for (const [from, to] of FLOWS) {
  const dashed = from === 'sih' || from === 'sihb';
  p3.edge(ids[from], ids[to], dashed ? '#6c8ebf' : '#666666', dashed);
}
const tail = 'Blue dashed: the SIH side (Hull lines configured in SIH). Calculated in Tableau, no table: Calendar, the 14 periods, Loss in CUs, minutes and hours, running %, Capacity Checker, all measures; targets / 100. One page per table follows.';
p3.box(40, Math.max(sy, by, ty, gy) + 20, 1620, fit(1620, [tail]), esc(tail), 'neutral');

// ---- Pages: one per table ------------------------------------------------------------
const PAGE_ORDER = (p) => (p.startsWith('EU') ? 0 : p.startsWith('N') ? 1 : 2);
function usedBy(table, column) {
  const [t, c] = LOOKUP_USE[column] ?? [table, column];
  const list = [...new Set([...(USAGE[t]?.[c] ?? []), ...(t !== table ? USAGE[table]?.[column] ?? [] : [])])];
  if (list.length === 0) {
    return KEYS.has(column) ? 'join key (Calendar, machine, product)' : '';
  }
  list.sort((a, b) => PAGE_ORDER(a) - PAGE_ORDER(b) || a.localeCompare(b));
  const count = (p) => list.filter((x) => x.startsWith(p)).length;
  let text = `EU ${count('EU:')}, Nottingham ${count('N:')}, Hull ${count('H:')} pages`;
  if (list.length <= 4) {
    text += `: ${list.join(', ')}`;
  }
  return text;
}
function example(table, column) {
  const t = PROFILE[table];
  const c = t?.columns.find((x) => x.name === column);
  if (!c) {
    return '';
  }
  const share = c.filled_share < 0.995 ? ` (${Math.round(c.filled_share * 100)} % filled)` : '';
  return `${c.examples.slice(0, 2).join(' | ')}${share}`;
}
const W2 = [230, 240, 300, 320, 280];
function tablePage(name, about, rows) {
  const p = newPage(`Table: ${name}`);
  let t = bold(name);
  t += `<br>${small(about)}`;
  p.text(40, 20, 1300, 60, t);
  legend(p, 1460, 20, Object.keys(STATUS).map((k) => `st_${k}`));
  let ry = header(p, 40, 100, W2, ['Column (type)', 'Example (Segun extract)', 'Provideam rule', 'SIH rule', 'Used by (agreed pages)']);
  for (const [col, type, prov, sih, status, ex, use] of rows) {
    const label = `${col} (${type})`;
    ry = row(p, 40, ry, [
      [W2[0], `${bold(col)}<br>${small(`${type} - ${STATUS[status].label}`)}`, `st_${status}`, `${label} ${STATUS[status].label}`],
      [W2[1], esc(ex), 'neutral', ex],
      [W2[2], esc(prov), 'neutral', prov],
      [W2[3], esc(sih), 'neutral', sih],
      [W2[4], esc(use), 'neutral', use],
    ]);
  }
}
const EXISTING = [
  ['Plan_OPT_EU', reportPlanSchema, 'One row per production day, machine, shift and part. Provideam rows from the PBI report build (month files), SIH rows from the SIH report daily tab (day files). Tableau data source: eu_report/report/Plan_OPT_EU/.'],
  ['Time_Utilisation_EU', reportUtilSchema, 'One row per production day and machine (no shift): minutes summed from the plan rows. Same two sources.'],
  ['Daily_Losses_EU', reportLossSchema, 'One row per stop. Provideam: Line Losses joined with Volume Loss Correction, Equipment Coding and Glidepaths. SIH: downtimeReasons with the reason tree.'],
];
for (const [name, schema, about] of EXISTING) {
  const rows = schema.map(([col, type]) => {
    const [prov, sih, given] = INFO[name][col] ?? ['?', '?', 'ok'];
    // usedBy() names join keys too, so only columns no page reads are grey.
    const use = usedBy(name, col);
    return [col, String(type), prov, sih, use ? given : 'unused', example(name, col), use];
  });
  rows.push([IDEA[0], IDEA[1], IDEA[2], IDEA[3], IDEA[4], '', 'EU pages (filter = true)']);
  tablePage(name, about, rows);
}
for (const [name, def] of Object.entries(NEW_TABLES)) {
  const rows = def.cols.map(([col, type, prov, sih]) => {
    const common = NEW_COMMON[col] ?? [];
    const use = usedBy(name, col);
    return [col, type, prov ?? common[0] ?? '', sih ?? common[1] ?? '', 'new', '', use];
  });
  if (name !== 'Format_List_EU' && name !== 'Historical_OEE_EU') {
    rows.push([IDEA[0], IDEA[1], IDEA[2], IDEA[3], IDEA[4], '', 'EU pages (filter = true)']);
  }
  tablePage(def.title, def.about, rows);
}

// ---- Page: the build (2026-10-27) -----------------------------------------------------
const pb = newPage('Build: what runs where (2026-10-27)');
title = bold('Built on 2026-10-27: the scope file, a second build tab, the Configuration tab and the archive');
title += `<br>${small('Green: existed before. Orange: new. Every table gets In EU Report from config/report_scope.csv. Docs: report-scope.md, pbi-report-build-2.md, historical-oee.md, run-monitor.md.')}`;
pb.text(40, 20, 1400, 50, title);
const inX = 40;
const tabX = 470;
const outX = 960;
const inputs = [
  ['source/plan_opt', 'have'],
  ['source/line_losses, volume_loss_correction', 'have'],
  ['source/run_rates (normalizer type, new)', 'table'],
  ['reference/machine_names, shift_naming', 'have'],
  ['reference/glidepaths, equipment_coding', 'have'],
  ['reference/report_scope (config/report_scope.csv)', 'table'],
  ['reference/format_list (Nottingham: none)', 'table'],
  ['downloads: Historical OEE archives', 'archive'],
];
const inBox = {};
let iy = 100;
for (const [label, level] of inputs) {
  inBox[label] = pb.box(inX, iy, 360, 44, esc(label), level);
  iy += 60;
}
const listener = pb.box(tabX, 100, 380, 70, `${bold('PBI report listener')}<br>${small('file events -> jobQueue (tab 1) / jobQueue_2 (tab 2); JOB DONE per tab')}`, 'have');
const tab1 = pb.box(tabX, 200, 380, 80, `${bold('PBI report build (176 nodes)')}<br>${small('+ lane REPORT SCOPE; machine lookup unfiltered')}`, 'have');
const tab2 = pb.box(tabX, 310, 380, 80, `${bold('PBI report build 2 (137 nodes, new)')}<br>${small('machine names, shift, scope setup; run rates, Volume CoV, Format List')}`, 'table');
const sihTab = pb.box(tabX, 420, 380, 60, `${bold('SIH report daily (Hull)')}<br>${small('In EU Report = true on its rows')}`, 'have');
const script = pb.box(tabX, 510, 380, 60, `${bold('historical-oee-convert.js + upload.js')}<br>${small('one time, run by hand')}`, 'archive');
const monitor = pb.box(tabX, 600, 380, 70, `${bold('Run monitor')}<br>${small('new tab Configuration: Config settings + scope rules; flow pbi-report-2 listed')}`, 'table');
const outs = [
  ['Plan_OPT_EU', tab1, 'have'],
  ['Time_Utilisation_EU', tab1, 'have'],
  ['Daily_Losses_EU', tab1, 'have'],
  ['Run_Rates_EU', tab2, 'table'],
  ['Volume_CoV_EU', tab2, 'table'],
  ['Format_List_EU', tab2, 'table'],
  ['Historical_OEE_EU', script, 'archive'],
];
let oy = 100;
for (const [name, from, level] of outs) {
  const box = pb.box(outX, oy, 300, 44, `${bold(name)}<br>${small('report/' + name + '/site=...')}`, level);
  pb.edge(from, box, '#666666');
  oy += 60;
}
pb.edge(sihTab, pb.box(outX + 340, 160, 220, 60, `${bold('SIH rows')}<br>${small('Plan, Time Utilisation, Losses')}`, 'have'), '#6c8ebf', true);
pb.edge(listener, tab1, '#666666');
pb.edge(listener, tab2, '#666666');
pb.edge(inBox['reference/report_scope (config/report_scope.csv)'], tab1, '#d79b00');
pb.edge(inBox['reference/report_scope (config/report_scope.csv)'], tab2, '#d79b00');
pb.edge(inBox['reference/report_scope (config/report_scope.csv)'], monitor, '#d79b00', true);
pb.edge(inBox['source/run_rates (normalizer type, new)'], tab2, '#d79b00');
pb.edge(inBox['reference/format_list (Nottingham: none)'], tab2, '#d79b00');
pb.edge(inBox['downloads: Historical OEE archives'], script, '#9673a6');

// ---- Page: EU scope (idea C1) ----------------------------------------------------------
const p2 = newPage('EU scope (idea C1)');
title = bold('Built 2026-10-27 (C1): the rows the EU report drops are kept and marked with the column In EU Report, rules in config/report_scope.csv');
title += `<br>${small('The site dashboards use the same Provideam files and query steps as the EU report, without the EU filters. Our build copies the EU filters today. For the meeting with Segun, then Reckitt.')}`;
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
const b2 = p2.box(left + 380, ly, 320, 60, `${bold('Build (idea C1)')}<br>${small('a scope rule SETS In EU Report = true / false')}`, 'change');
const b3 = p2.box(left + 780, ly, 320, 60, `${bold('Our 3 tables + In EU Report')}<br>${small('all machines; Machine Names lookup unfiltered')}`, 'change');
const b4 = p2.box(left + 1180, ly - 40, 260, 50, `${bold('EU pages')}<br>${small('filter In EU Report = true')}`, 'have');
const b5 = p2.box(left + 1180, ly + 50, 260, 50, `${bold('Site pages')}<br>${small('no EU filter; S14 / packing filters per page')}`, 'have');
p2.edge(b1, b2, '#666666');
p2.edge(b2, b3, '#666666');
p2.edge(b3, b4, '#82b366');
p2.edge(b3, b5, '#82b366');
ly += 130;
p2.text(left, ly, 1100, 30, bold('Today\'s EU rules: one rule for Hull, a different rule per table for Nottingham'));
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
const oneRule = 'The intent is one rule per machine: "packing lines, not S14". Applying it to every table makes the EU numbers move slightly where today\'s Nottingham rules differ (losses and CoV of non-packing machines, T1 in Time Utilisation). To decide (D1).';
p2.box(left, ly, 1106, fit(1106, [oneRule]), esc(oneRule), 'change');
ly += fit(1106, [oneRule]) + 30;
p2.text(left, ly, 1100, 30, bold('Where the scope could live (to discuss)'));
ly += 34;
const W7 = [300, 330, 330, 330];
ly = header(p2, left, ly, W7, ['Option', 'How', 'For', 'Against']);
for (const [opt, how, pro, con] of SCOPE_OPTIONS) {
  ly = row(p2, left, ly, [
    [W7[0], bold(opt), 'grey', opt],
    [W7[1], esc(how), 'neutral', how],
    [W7[2], esc(pro), 'neutral', pro],
    [W7[3], esc(con), 'neutral', con],
  ]);
}
const size = 'Size: Nottingham plan rows about 2.4 times (Sep 2026: 1,132 to 2,744). Proof when built: the rows with In EU Report = true equal today\'s files (with the per-table rules).';
p2.box(left, ly + 10, 1308, fit(1308, [size]), esc(size), 'neutral');

// ---- Page: SIH coverage ---------------------------------------------------------
const p4 = newPage('What SIH can give');
title = bold('Every data need: Provideam today and the SIH source for a line that has switched');
title += `<br>${small('Coverage today: Hull B2 Line + 7 machines and GT4 in SIH; Nottingham N1 not configured. Plan to switch lines exists. Columns are not the limit: the loss reasons and comments are.')}`;
p4.text(40, 20, 1300, 50, title);
legend(p4, 1400, 20, ['have', 'table', 'archive', 'source', 'none']);
const W4 = [250, 210, 260, 420];
y = header(p4, 40, 100, W4, ['Need', 'Provideam today', 'SIH source', 'Gap on SIH lines']);
for (const [need, prov, sih, level, gap] of SIH) {
  y = row(p4, 40, y, [
    [W4[0], bold(need), 'neutral', need],
    [W4[1], esc(prov), 'neutral', prov],
    [W4[2], esc(sih), level, sih],
    [W4[3], esc(gap), 'neutral', gap],
  ]);
}

// ---- Page: decisions -------------------------------------------------------------------
const p5 = newPage('Discussion: open decisions');
title = bold('Decisions: D1, D2, D3, D5 agreed and built on 2026-10-27, the others open');
title += `<br>${small('Grouped by who decides. Green note = remark of the user (2026-10-23). Numbers as in prompt-response/site-dashboards-analysis.md section 5.')}`;
p5.text(40, 20, 1300, 50, title);
const W5 = [60, 380, 160, 330, 330];
y = 90;
for (const [group, label] of GROUPS) {
  p5.text(40, y, 900, 26, bold(label));
  y += 30;
  y = header(p5, 40, y, W5, ['#', 'Decision', 'Who', 'Recommendation', 'Note']);
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

// ---- Page: parked differences ------------------------------------------------------------
const p6 = newPage('Parked: SIH vs Provideam differences');
title = bold('Known differences between SIH and Provideam, parked until the SIH setup is finished');
title += `<br>${small('One register, so nothing is forgotten. Escalate to Reckitt per line before it switches to SIH, or at the moment named in the last column.')}`;
p6.text(40, 20, 1300, 50, title);
const W6 = [170, 560, 260, 260];
y = header(p6, 40, 90, W6, ['Area', 'Difference', 'Written in', 'Escalate when']);
for (const [area, diff, where, when] of PARKED) {
  y = row(p6, 40, y, [
    [W6[0], bold(area), 'neutral', area],
    [W6[1], esc(diff), 'neutral', diff],
    [W6[2], esc(where), 'neutral', where],
    [W6[3], esc(when), when.startsWith('now') ? 'source' : 'neutral', when],
  ]);
}

// ---- Background pages: still-valid pages of the old map, with a note -------------------
const reference = readFileSync(REFERENCE, 'utf8');
const background = [];
for (const [oldName, newName, since] of BACKGROUND) {
  const re = new RegExp(`<diagram\\b[^>]*\\bname="${oldName.replace(/[()]/g, '\\$&')}"[\\s\\S]*?</diagram>`);
  const page = reference.match(re)?.[0];
  if (!page) {
    throw new Error(`Page not found in ${REFERENCE}: ${oldName}`);
  }
  const xs = [...page.matchAll(/<mxGeometry[^>]*\bx="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
  const ys = [...page.matchAll(/<mxGeometry[^>]*\by="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  let text = bold('Background page (state of 2026-10-14, copied from powerbi-data-map.drawio)');
  text += `<br>${esc(since)}`;
  const h = fit(1000, ['Background page (state of 2026-10-14, copied from powerbi-data-map.drawio)', since]);
  let style = 'rounded=1;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;spacingLeft=8;';
  style += 'fontSize=11;fillColor=#fff2cc;strokeColor=#d6b656;';
  const cell = `<mxCell id="bg-note" value="${esc(text)}" style="${style}" vertex="1" parent="1">` +
    `<mxGeometry x="${x0}" y="${y0 - h - 30}" width="1000" height="${h}" as="geometry"/></mxCell>`;
  background.push(
    page
      .replace(/(<diagram\b[^>]*\bname=")[^"]*"/, `$1Background: ${esc(newName)}"`)
      .replace(/(<mxCell id="1" parent="0"\s*\/>)/, `$1${cell}`),
  );
}

// ---- Write -----------------------------------------------------------------------------
let out = `<mxfile host="build-drawio-site-dashboards.js" type="device" pages="${pages.length + background.length}">`;
out += pages.map((p) => p.xml()).join('');
out += background.join('');
out += '</mxfile>\n';
writeFileSync(OUTPUT, out);
console.log(`Wrote ${OUTPUT}: ${pages.length} pages + ${background.length} background pages`);
