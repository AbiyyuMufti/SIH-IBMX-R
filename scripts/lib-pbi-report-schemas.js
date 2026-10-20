// The parquet column lists of the three tables of the PBI report build:
// the column names, order and types of the Tableau data sources Plan_OPT_EU,
// Time_Utilisation_EU and Daily_Losses_EU (the extracts with Dept, Area and
// Product Type joined from Machine Names), then Data Source and our own extra
// columns (snake_case).
// Types: UTF8 (S), INT64 (I), DOUBLE (D), DATE, TIMESTAMP_MILLIS (TS).
// DATE columns are written from a day number (days since 1970-01-01), times
// of day from the milliseconds of the day on 1970-01-01 (the parquet node
// cannot write dates before 1970). Spike results: docs/pbi-report-build.md.
import { S, I, D, TS } from './lib-flow-builder.js';

const DATE = 'DATE';
const str = (names) => names.map((n) => [n, S]);

// The machine columns and the source, after the report columns.
const machineCols = str(['Dept', 'Area', 'Product Type', 'Data Source']);

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
