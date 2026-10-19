// The parquet column lists of the shift report tables (rpt_window, rpt_hour,
// rpt_event). Types: UTF8 (S), INT64 (I), DOUBLE (D), TIMESTAMP_MILLIS (TS).
// Days are text YYYY-MM-DD (no DATE type). Every table starts with the same
// keys, so one set of tables serves every line and site.
import { S, I, D, TS } from './lib-flow-builder.js';

const str = (names) => names.map((n) => [n, S]);
const num = (names) => names.map((n) => [n, D]);

const keys = str([
  'site', 'line_id', 'line_name', 'asset_id', 'asset_name', 'asset_level',
  'production_day'
]);

export const windowSchema = [
  ...keys,
  ...str(['window_kind', 'window_name']),
  ['window_start', TS],
  ['window_end', TS],
  ['hours', I],
  ...num([
    'oee', 'availability', 'performance', 'quality', 'total_parts',
    'good_parts', 'rejected_parts', 'theoretical_output', 'total_min',
    'planned_stop_min', 'operational_min', 'net_production_min',
    'availability_loss_min', 'performance_loss_min', 'quality_loss_min',
    'used_operational_min', 'downtime_min', 'micro_stop_min',
    'macro_stop_min'
  ]),
  ['downtime_count', I],
  ['micro_stop_count', I],
  ['macro_stop_count', I],
  ...num([
    'capacity_units', 'availability_loss_units', 'performance_loss_units',
    'quality_loss_units', 'design_speed_per_min', 'running_rate', 'ran_min',
    'fault_min', 'operator_min', 'waiting_min', 'planned_min', 'other_min'
  ]),
  ['loaded_at', TS]
];

export const hourSchema = [
  ...keys,
  ['hour_start', TS],
  ['hour_end', TS],
  ...str([
    'local_date', 'local_time', 'shift_name', 'product_key', 'part_name',
    'batch_id'
  ]),
  ...num([
    'total_parts', 'good_parts', 'rejected_parts', 'operational_min',
    'net_production_min', 'availability_loss_min', 'downtime_min',
    'micro_stop_min', 'design_speed_per_min', 'speed_per_min',
    'capacity_units'
  ]),
  ['loaded_at', TS]
];

export const eventSchema = [
  ...keys,
  ['event_start', TS],
  ['event_end', TS],
  ...str([
    'local_date', 'local_time', 'shift_name', 'event_kind', 'reason',
    'reason_path', 'reason_full_path'
  ]),
  ['minutes', D],
  ['occurrence', I],
  ['comment_count', I],
  ...str(['batch_id', 'part_name', 'product_key']),
  ['loss_units', D],
  ['loaded_at', TS]
];
