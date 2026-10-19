// The facts about the shift report tables that more than one script needs:
// which columns each report block uses (diagram page "Columns per block" and
// the package for the Tableau developer), what each column means, and the
// best days to design on. Column names are those of lib-rpt-schemas.js.

// Columns each report block needs, per table: [filter, [columns]]. Used by
// the page "Columns per block". Column names are those of the rpt_* tables.
export const BLOCK_COLUMNS = {
  header: {
    window: ['line rows, day window', ['site', 'line_name', 'production_day', 'window_start', 'window_end']],
    hour: ['line rows', ['local_date', 'local_time (times in local time)']],
  },
  how: {
    window: ['asset_level = line, day or shift', ['oee', 'availability', 'performance', 'quality', 'total_parts', 'good_parts', 'rejected_parts', 'operational_min', 'net_production_min', 'availability_loss_min', 'planned_stop_min', 'downtime_min', 'micro_stop_min', 'performance_loss_min (time under target: rule needed)']],
  },
  bottles: {
    window: ['asset_level = line, day or shift', ['capacity_units', 'good_parts', 'rejected_parts', 'availability_loss_units', 'performance_loss_units', 'quality_loss_units', 'running_rate', 'design_speed_per_min']],
  },
  hourly: {
    hour: ['asset_level = line', ['hour_start', 'local_time', 'shift_name', 'total_parts', 'good_parts', 'net_production_min', 'speed_per_min', 'capacity_units']],
    window: ['line, window_kind = day, last 30 days', ['production_day', 'good_parts', 'capacity_units']],
  },
  machines: {
    window: ['asset_level = machine, day or shift', ['asset_name', 'availability', 'quality', 'performance', 'total_parts', 'rejected_parts', 'downtime_min']],
    event: ['asset_level = machine', ['asset_name', 'reason', 'minutes', 'occurrence']],
  },
  ran: {
    hour: ['line or machine', ['batch_id', 'product_key', 'part_name', 'hour_start', 'total_parts', 'good_parts (a run block = hours of one batch and product)']],
    event: ['event_kind = planned', ['reason', 'event_start', 'event_end', 'minutes (cleans, maintenance: planned reasons untested)']],
    reckitt: ['file', ['batch target quantity (SAP)']],
  },
  planned: {
    event: ['event_kind = planned', ['asset_name', 'reason', 'event_start', 'event_end', 'minutes']],
    reckitt: ['file', ['target per changeover or clean']],
  },
  wrote: {
    event: ['line or machine', ['asset_name', 'local_time', 'event_start', 'event_end', 'reason', 'minutes', 'comment_count (the text is in Provideam)']],
  },
  measured: {},
  stopped: {
    window: ['asset_level = machine, day or shift', ['asset_name', 'ran_min', 'fault_min', 'waiting_min', 'planned_min', 'other_min', 'operator_min (empty)', 'total_parts', 'rejected_parts']],
    event: ['asset_level = machine', ['asset_name', 'reason', 'reason_path', 'minutes', 'occurrence', 'event_kind (top 3 faults and waits: ranking in Tableau)']],
  },
  threw: {
    window: ['asset_level = machine', ['asset_name', 'total_parts', 'rejected_parts']],
    counter: ['later', ['counter name', 'count in the window (filler: bad cap, torque, weight, no insert, insert)']],
    reckitt: ['file', ['cost per reject (costing sheet)']],
  },
};

// Best days to design on (from the exports of 2026-10-19).
export const DAY_GUIDE = [
  ['2026-09-15', 'Use this one first. Line and 7 machines, a product, OEE and performance filled, orders on the machines Antares and Palletiser, 1,952 events.'],
  ['2026-09-14', 'Second day. Line and 7 machines, but no product: performance, OEE, capacity and loss units are empty (the OEE app shows the same). Good to test empty values.'],
  ['2026-10-16 and 2026-10-18', 'Line only (no machine rows, written before the machines were added). Only for line level visuals.'],
];

// The report blocks: name and what the data can give today.
export const BLOCK_INFO = {
  header: ['Header', 'available'],
  how: ['How the line did', 'available (time under target needs a rule)'],
  bottles: ['The day in bottles', 'available'],
  hourly: ['By hour and last 30 days', 'available (the trend needs more days in the data)'],
  machines: ['Machines', 'available'],
  ran: ['What ran', 'partly (batch target missing, planned stops not seen yet)'],
  planned: ['Planned work against target', 'partly (no planned stops seen yet, targets missing)'],
  wrote: ['What the operators wrote', 'partly (comment text is not in the data)'],
  measured: ['What it measured (filler heads)', 'not in the data'],
  stopped: ['What stopped it, machine performance', 'available (operator stops empty)'],
  threw: ['What it threw away', 'partly (reject reasons and cost missing)'],
};

// What every column means: [meaning, unit or note].
export const COLUMN_INFO = {
  site: ['Site name', 'text'],
  line_id: ['Id of the line in Insights Hub', 'text'],
  line_name: ['Name of the line. Filter the report on this', 'text'],
  asset_id: ['Id of the line or machine of this row', 'text'],
  asset_name: ['Name of the line or machine of this row', 'text'],
  asset_level: ['line = the line as a whole, machine = one machine of the line', 'text'],
  production_day: ['Production day, from 06:00 to 06:00 local time. Filter the report on this', 'text YYYY-MM-DD'],
  window_kind: ['day = the whole production day, shift = one shift. Never add a day row to its shift rows', 'text'],
  window_name: ['The date for a day row, the crew name for a shift row', 'text'],
  window_start: ['Start of the window', 'UTC, no time zone in the text'],
  window_end: ['End of the window', 'UTC, no time zone in the text'],
  hours: ['Number of hours in the window', 'count'],
  oee: ['OEE = availability x performance x quality. Same value as the OEE app', 'fraction, 1 = 100 %. Empty without a product'],
  availability: ['Net production time / operational time', 'fraction'],
  performance: ['Total parts / theoretical output. Above 1 means faster than the design speed', 'fraction. Empty without a product'],
  quality: ['Good parts / total parts', 'fraction'],
  total_parts: ['Parts counted', 'count'],
  good_parts: ['Good parts', 'count'],
  rejected_parts: ['Rejected parts', 'count'],
  theoretical_output: ['Parts the asset could make at design speed in its planned time', 'count. Empty without a product'],
  total_min: ['Time of the window in the calendar', 'minutes'],
  planned_stop_min: ['Planned stops from the shift plan and planned states', 'minutes'],
  operational_min: ['Planned running time (window minus planned stops)', 'minutes'],
  net_production_min: ['Operational time minus availability losses', 'minutes'],
  availability_loss_min: ['Time lost to stops', 'minutes'],
  performance_loss_min: ['Time lost to running slower than design speed. Negative when faster', 'minutes. Empty without a product'],
  quality_loss_min: ['Time lost to rejects', 'minutes. Empty without a product'],
  used_operational_min: ['Time that produced good parts', 'minutes. Empty without a product'],
  downtime_min: ['All stop time (micro and macro stops)', 'minutes'],
  micro_stop_min: ['Short stops', 'minutes'],
  macro_stop_min: ['Longer stops', 'minutes'],
  downtime_count: ['Number of stops', 'count'],
  micro_stop_count: ['Number of short stops', 'count'],
  macro_stop_count: ['Number of longer stops', 'count'],
  capacity_units: ['Parts that fit in the operational time at design speed', 'parts. Empty without a product'],
  availability_loss_units: ['Availability loss expressed in parts at design speed', 'parts. Empty without a product'],
  performance_loss_units: ['Performance loss expressed in parts at design speed', 'parts. Empty without a product'],
  quality_loss_units: ['Quality loss expressed in parts at design speed', 'parts. Empty without a product'],
  design_speed_per_min: ['Design speed of the product', 'parts per minute. Empty without a product'],
  running_rate: ['Total parts per minute of net production time', 'parts per minute'],
  ran_min: ['Machine rows only: time running', 'minutes'],
  fault_min: ['Machine rows only: time stopped by a fault (Unplanned Downtime)', 'minutes'],
  operator_min: ['Machine rows only: operator stops. NOT FILLED: no source yet', 'minutes. Always empty'],
  waiting_min: ['Machine rows only: waiting on the line, starved or blocked (Lack of resources)', 'minutes'],
  planned_min: ['Machine rows only: planned downtime', 'minutes'],
  other_min: ['Machine rows only: everything else', 'minutes'],
  loaded_at: ['When the row was written to the data lake', 'UTC'],
  hour_start: ['Start of the hour', 'UTC, no time zone in the text'],
  hour_end: ['End of the hour', 'UTC, no time zone in the text'],
  local_date: ['Date on the local clock (UK). Use this in the report', 'text YYYY-MM-DD'],
  local_time: ['Time on the local clock (UK). Use this in the report', 'text HH:MM or HH:MM:SS'],
  shift_name: ['Crew name of the shift in the Insights Hub calendar. Empty outside a shift', 'text'],
  product_key: ['Product code of the product that ran', 'text. Empty without a product'],
  part_name: ['Product description', 'text. Empty without a product'],
  batch_id: ['Order that ran. Filled on the machines 05 Antares and 07 Palletiser, not on the line', 'text. Often empty'],
  speed_per_min: ['Total parts per minute of net production time in the hour', 'parts per minute. Empty when it did not run'],
  event_start: ['Start of the stop', 'UTC, no time zone in the text'],
  event_end: ['End of the stop', 'UTC. Empty while the stop is open'],
  event_kind: ['unplanned, planned or microstop. Only unplanned occurs in the days we have', 'text'],
  reason: ['Reason of the stop, the alarm with its code', 'text'],
  reason_path: ['Branch of the reason tree above the reason', 'text'],
  reason_full_path: ['Whole path of the reason', 'text'],
  minutes: ['Length of the stop', 'minutes. Empty while the stop is open'],
  occurrence: ['Number of occurrences the row stands for', 'count'],
  comment_count: ['Number of operator comments (always 0: comments are not in Insights Hub)', 'count'],
  loss_units: ['Stop length expressed in parts at design speed', 'parts. Empty without a product'],
};
