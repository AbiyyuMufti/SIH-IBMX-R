// The parquet column lists of the tables of the PBI report build
// (pbi_report): the column names, order and types of the data sources of the
// Tableau workbook "EU Daily OEE Report" (Machine Names EU, Plan OPT EU, Time
// Utilisation EU, Daily Losses EU), so that Replace Data Source works like for
// like. Our own extra columns (snake_case) follow at the end of each table.
// Types: UTF8 (S), INT64 (I), DOUBLE (D), DATE, TIMESTAMP_MILLIS (TS).
// DATE columns are written from a day number (days since 1970-01-01), times
// of day from the milliseconds of the day on 1970-01-01 (the parquet node
// cannot write dates before 1970). Spike results: docs/pbi-report-build.md.
import { S, I, D, TS } from './lib-flow-builder.js';

const DATE = 'DATE';
const str = (names) => names.map((n) => [n, S]);

export const reportMachineSchema = [
  ...str(['MachineName', 'Dept', 'Area', 'Product Type', 'SiteName',
    'Unique Machine Name']),
  ['loaded_at', TS]
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
  ['loaded_at', TS]
];

// The three columns of Daily Losses EU that the diagram marks as not needed
// (Merged, ShiftName - Copy, Volume Key.1) are left out.
export const reportLossSchema = [
  ['Date', DATE],
  ['Time', TS],
  ...str(['MachineName', 'PartDesc', 'Shift Time', 'ShiftName',
    'OEELossLvl3Group', 'OEELossLvl3SubGroup', 'OEELossLvl3Desc']),
  ['Duration', TS],
  ...str(['SiteName', 'Unique Machine Name', 'Breakdown Types']),
  ['ShiftStartDate.1', DATE],
  ...str(['Comment', 'Product Key', 'Volume Key']),
  ['Loss Units', D],
  ['Time in Mins', D],
  ...str(['Equipment Loss Key', 'Equipment', 'Lvl 3 Loss Name',
    'Loss Target Key', 'Value']),
  ['Volume Total', D],
  ['Loss Final Level', S],
  ['target', D],
  ['batch_id', S],
  ['comment_count', I],
  ['loaded_at', TS]
];
