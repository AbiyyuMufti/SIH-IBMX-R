// The parquet column lists of the tables of the PBI report build tabs:
// the column names, order and types of the Tableau data sources Plan_OPT_EU,
// Time_Utilisation_EU and Daily_Losses_EU (the extracts with Dept, Area and
// Product Type joined from Machine Names), then Data Source and our own extra
// columns (snake_case).
// Types: UTF8 (S), INT64 (I), DOUBLE (D), DATE, TIMESTAMP_MILLIS (TS).
// DATE columns are written from a day number (days since 1970-01-01), times
// of day from the milliseconds of the day on 1970-01-01 (the parquet node
// cannot write dates before 1970). Spike results: docs/pbi-report-build.md.
import { S, B, I, D, TS } from './lib-flow-builder.js';

const DATE = 'DATE';
const str = (names) => names.map((n) => [n, S]);

// The machine columns, the source and the EU scope (false: a row the EU
// pages leave out, the site pages keep), after the report columns.
const machineCols = [
  ...str(['Dept', 'Area', 'Product Type', 'Data Source']),
  ['In EU Report', B]
];

export const reportPlanSchema = [
  ['Date', DATE],
  ...str(['AreaName', 'MachineName', 'ShiftName', 'PartName']),
  ['Good Parts', I],
  ['Capacity', D],
  ['Total Time', I],
  ['Planned OpT', I],
  ['OEE Time', I],
  ['Downtime Units', D],
  ...str(['SiteName', 'Unique Machine Name', 'Product Key']),
  ['UPDT Target', D],
  ['PDT Target', D],
  ['OEE Target', D],
  ...machineCols,
  ['source_hours', I],
  ['loaded_at', TS]
];

// The Format List columns (Brand ...) joined on Product Key.
const formatCols = [
  ...str(['Brand', 'Unit Size', 'Unit Count/Format', 'Extra Info'])
];

// The tables of the PBI report build tabs since 2026-10-30: the columns,
// order and types of Segun's site dashboard tables (Sandbox/site_draft),
// then our own. The SIH flow and the Chartres conversion keep the schemas
// above (shortcut: two schemas per table until the SIH flow gets the new
// columns too).
export const pbiPlanSchema = [
  ...reportPlanSchema.slice(0, 17),
  ...str(['Dept', 'Area', 'Product Type']),
  ['Defect Parts', I],
  ['OEE', D],
  ['Shift Colour', S],
  ['ShiftStartTime', TS],
  ['Target', D],
  ['Targets Key', S],
  ...formatCols,
  ...str(['Data Source']),
  ['In EU Report', B],
  ['source_hours', I],
  ['loaded_at', TS]
];

export const reportUtilSchema = [
  ['Date', DATE],
  ['MachineName', S],
  ['OEE Time Total', D],
  ['Total Time Total', D],
  ['Planned OPT Total', D],
  ...str(['SiteName', 'Unique Machine Name']),
  ['All Time', I],
  ...machineCols,
  ['loaded_at', TS]
];

// Merged, ShiftName - Copy and Volume Key.1 of the extract are left out
// (decision of the user, 2026-10-20).
export const reportLossSchema = [
  ['Date', DATE],
  ['Time', TS],
  ...str(['MachineName', 'PartName', 'Shift Time', 'ShiftName',
    'OEELossLvl3Group', 'OEELossLvl3SubGroup', 'OEELossLvl3Desc']),
  ['Duration', TS],
  ...str(['SiteName', 'Unique Machine Name', 'Breakdown Types']),
  ['ShiftStartDate', DATE],
  ...str(['Comment', 'Product Key', 'Volume Key']),
  ['Loss Units', D],
  ['Time in Mins', D],
  ...str(['Equipment Loss Key', 'Equipment', 'Lvl 3 Loss Name',
    'Loss Target Key', 'Value']),
  ['Volume Total', D],
  ['Loss Final Level', S],
  ...machineCols,
  ['target', D],
  ['batch_id', S],
  ['comment_count', I],
  ['loaded_at', TS]
];

// Segun's order; Merged, ShiftName - Copy and Volume Key.1 are left out
// (not used, decision of the user 2026-10-30). Duration is whole minutes,
// Value a number. Shift Time is ours.
export const pbiLossSchema = [
  ['Date', DATE],
  ['Time', TS],
  ...str(['MachineName', 'PartName', 'ShiftName', 'OEELossLvl3Group',
    'OEELossLvl3SubGroup', 'OEELossLvl3Desc']),
  ['Duration', I],
  ...str(['SiteName', 'Unique Machine Name', 'Breakdown Types']),
  ['ShiftStartDate', DATE],
  ...str(['Comment', 'Product Key', 'Volume Key']),
  ['Loss Units', D],
  ...str(['Equipment', 'Loss Target Key']),
  ['Value', D],
  ['Volume Total', D],
  ...str(['Loss Final Level', 'Batch ID', 'Dept', 'Area', 'Product Type',
    'Equipment Loss Key', 'Lvl 3 Loss Name', 'Shift colour']),
  ['Time in Mins', D],
  ...formatCols,
  ...str(['Shift Time', 'Data Source']),
  ['In EU Report', B],
  ['target', D],
  ['comment_count', I],
  ['loaded_at', TS]
];

// Tab PBI report build 2. Run_Rates_EU: one row per machine and hour, in
// the order of Segun's Site_Run_Rate: Date is the day, Hour (ours) the hour
// (wall clock written as UTC), ShiftName the raw name, Product Key machine +
// part (no site).
export const reportRunRateSchema = [
  ...str(['Area', 'AreaName']),
  ['Capacity', D],
  ['Date', DATE],
  ['Dept', S],
  ['Good Parts', I],
  ...str(['MachineName', 'PartName', 'Product Key', 'Product Type',
    'Shift Colour', 'Shift Time', 'ShiftName', 'Site']),
  ...formatCols,
  ['Hour', TS],
  ...str(['Unique Machine Name', 'Data Source']),
  ['In EU Report', B],
  ['loaded_at', TS]
];

// Volume_CoV_EU: one row per day, shift and machine with more than 1,000
// good parts, in the order of Segun's Sheet1 (Volume CoV); Time on Shift =
// the summed Total Time as a time (ms). Unique Machine Name, SiteName ours.
export const reportCovSchema = [
  ['Date', DATE],
  ...str(['MachineName', 'Shift Colour']),
  ['Good Parts Sum', I],
  ['Shift Machine Key', S],
  ['Cap Max', D],
  ['Time on Shift', TS],
  ...str(['Dept', 'Area', 'Product Type', 'Unique Machine Name', 'SiteName',
    'Data Source']),
  ['In EU Report', B],
  ['loaded_at', TS]
];

// Site_PDT_Targets / Site_UPDT_Targets: the Glidepaths file of each site,
// one row per line and month (Segun's tables), target as a fraction.
const targetSchema = (column) => [
  ...str(['Site', 'Line', 'OEE Bucket']),
  ['Date', DATE],
  [column, D],
  ['Volume Key', S],
  ['loaded_at', TS]
];
export const reportPdtSchema = targetSchema('PDT Target');
export const reportUpdtSchema = targetSchema('UPDT Target');

// Format_List_EU: the Format List file of each site, one file per site.
export const reportFormatSchema = [
  ...str(['Site Name', 'MachineName', 'Product Name', 'Brand', 'Unit Size',
    'Unit Count/Format', 'Extra Info', 'Unique Machine Name', 'Product Key']),
  ['loaded_at', TS]
];

// Historical_OEE_EU: the Provideam archive (2022 to Nov 2024), one row per
// machine and day, OEE / Availability / Performance as fractions (0.406).
// Written once by scripts/historical-oee-convert.js, no flow.
// Segun's Site_Historical_OEE order, then ours.
export const historicalOeeSchema = [
  ['Site', S],
  ['Date', DATE],
  ['MachineName', S],
  ['OEE', D],
  ['Availability', D],
  ['Performance', D],
  ...str(['Dept', 'Area', 'Product Type', 'Unique Machine Name',
    'Data Source']),
  ['In EU Report', B],
  ['loaded_at', TS]
];
