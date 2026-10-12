// The parquet column lists of the Power BI shaped tables, shared by the
// generators of the Power BI flows. Types: UTF8 (S), INT64 (I), DOUBLE (D),
// TIMESTAMP_MILLIS (TS). Dates are text YYYY-MM-DD (no DATE type).
import { S, I, D, TS } from './lib-flow-builder.js';

const str = (names) => names.map((n) => [n, S]);
const num = (names) => names.map((n) => [n, D]);

export const planSchema = [
  ...str(['site_name', 'area_name', 'machine_name', 'unique_machine_name',
    'date', 'shift_name', 'part_name', 'product_key']),
  ...num(['good_parts', 'capacity', 'downtime_units', 'total_time',
    'planned_opt', 'oee_time', 'oee_target', 'pdt_target', 'updt_target']),
  ['source_hours', I],
  ['loaded_at', TS]
];
export const utilSchema = [
  ...str(['site_name', 'machine_name', 'unique_machine_name', 'date']),
  ...num(['total_time_total', 'planned_opt_total', 'oee_time_total']),
  ['all_time', I],
  ['loaded_at', TS]
];
export const lossSchema = [
  ...str(['site_name', 'machine_name', 'unique_machine_name', 'date', 'time',
    'shift_start_date', 'shift_name']),
  ['duration', D],
  ['loss_units', D],
  ...str(['loss_lvl3_group', 'loss_lvl3_sub_group', 'loss_lvl3_desc',
    'loss_final_level', 'equipment', 'breakdown_types', 'batch_id']),
  ['comment_count', I],
  ...str(['part_name', 'product_key', 'loss_target_key']),
  ['value', D],
  ['target', D],
  ['volume_key', S],
  ['volume_total', D],
  ['loaded_at', TS]
];
export const machineSchema = [
  ...str(['site_name', 'area', 'dept', 'machine_name', 'product_type',
    'unique_machine_name']),
  ['loaded_at', TS]
];
export const shiftSchema = [['shift', S], ['loaded_at', TS]];
export const calendarSchema = [
  ['date', S], ['year', I], ['month_number', I], ['month', S],
  ['month_short_name', S], ['month_year', S], ['month_year_number', S],
  ['quarter', S], ['quarter_number', I], ['week_number', I],
  ['week_start', S]
];

