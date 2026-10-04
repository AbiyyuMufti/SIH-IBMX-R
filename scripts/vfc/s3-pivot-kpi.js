// Pivots the evaluateKPIs response to one entry per hour.
// In: the response (msg.payload.results, checked in node 3.3).
// Out: msg.hours = [{time, values}] oldest hour first, msg.kpiMeta and
// msg.unmapped (KPI names that have no column).

// KPI name in Insights Hub -> column name in fact_kpi.
var KPI_COLUMNS = {
  'Good parts': 'good_parts',
  'Total parts': 'total_parts',
  'Rejected parts': 'rejected_parts',
  'Connected rejected parts': 'connected_rejected_parts',
  'Manual rejected parts': 'manual_rejected_parts',
  'Theoretical output': 'theoretical_output',
  'Quality': 'quality',
  'Performance': 'performance',
  'Availability': 'availability',
  'OEE': 'oee',
  'TEEP': 'teep',
  'Total time': 'total_time_ms',
  'Planned stops': 'planned_stops_ms',
  'Planned stop from shift plan': 'planned_stop_shift_plan_ms',
  'Operational time': 'operational_time_ms',
  'Net production time': 'net_production_time_ms',
  'Net operational time': 'net_operational_time_ms',
  'Used operational time': 'used_operational_time_ms',
  'Availability losses': 'availability_losses_ms',
  'Availability loss (occurrence)': 'availability_loss_count',
  'Performance losses': 'performance_losses_ms',
  'Quality losses': 'quality_losses_ms',
  'MTTR': 'mttr_ms',
  'MTBF': 'mtbf_ms',
  'Downtime (duration)': 'downtime_ms',
  'Downtimes (occurrence)': 'downtime_count',
  'Micro stops (duration)': 'micro_stops_ms',
  'Micro stops (occurrence)': 'micro_stops_count',
  'Macro stops (duration)': 'macro_stops_ms',
  'Macro stops (occurrence)': 'macro_stops_count'
};
// Columns that are rounded to whole numbers. All others keep their decimals.
var INT_COLUMNS = [
  'total_time_ms',
  'planned_stops_ms',
  'planned_stop_shift_plan_ms',
  'operational_time_ms',
  'net_production_time_ms',
  'availability_losses_ms',
  'micro_stops_ms',
  'micro_stops_count',
  'macro_stops_ms'
];
// These columns come first in every row.
var RATIO_COLUMNS = [
  'oee',
  'teep',
  'availability',
  'performance',
  'quality'
];

function numOrNull(v) {
  if (v === null || v === undefined || v === '') {
    return null;
  }
  var n = Number(v);
  return isFinite(n) ? n : null;
}

// Collect the value of every KPI per hour.
var body = msg.payload;
var unmapped = [];
var byHour = {};
var times = [];
body.results.forEach(function (r) {
  var col = KPI_COLUMNS[r.name];
  if (!col) {
    if (unmapped.indexOf(r.name) < 0) {
      unmapped.push(r.name);
    }
    return;
  }
  (r.groups || []).forEach(function (g) {
    if (!byHour[g.time]) {
      byHour[g.time] = {};
      times.push(g.time);
    }
    byHour[g.time][col] = numOrNull(g.value);
  });
});

// One entry per hour with every column present (null when missing).
msg.hours = times.sort().map(function (t) {
  var hour = byHour[t];
  var values = {};
  RATIO_COLUMNS.forEach(function (c) {
    values[c] = hour[c] === undefined ? null : hour[c];
  });
  Object.keys(KPI_COLUMNS).forEach(function (k) {
    var c = KPI_COLUMNS[k];
    if (values.hasOwnProperty(c)) {
      return;
    }
    var x = hour[c] === undefined ? null : hour[c];
    var rounded = x !== null && INT_COLUMNS.indexOf(c) >= 0;
    values[c] = rounded ? Math.round(x) : x;
  });
  return { time: t, values: values };
});

var missing = null;
if (body.missingMapping && body.missingMapping.length) {
  missing = JSON.stringify(body.missingMapping);
}
msg.kpiMeta = {
  productUnit: body.productUnit || null,
  missingMapping: missing
};
msg.unmapped = unmapped;
delete msg.payload;
return msg;
