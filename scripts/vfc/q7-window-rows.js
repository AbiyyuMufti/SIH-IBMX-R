// Builds the rpt_window rows of one asset: the production day and every
// shift run of the day, from the hourly KPIs (sums, ratios recalculated).
// In: msg.hours (tagged by node 7.2), msg.h, msg.asset, msg.day,
// msg.dayFromMs, msg.dayToMs. Out: msg.windowRows. Drops msg.hours.
var MIN_MS = 60000;
var HOUR_MS = 3600000;
var loadedAt = msg.loadedAt || Date.now();

// KPI column of an hour -> key of its sum in a window.
var SUMS = {
  total_parts: 'total',
  good_parts: 'good',
  rejected_parts: 'rejected',
  theoretical_output: 'theoretical',
  total_time_ms: 'totalTime',
  planned_stops_ms: 'plannedStops',
  operational_time_ms: 'operational',
  net_production_time_ms: 'net',
  availability_losses_ms: 'availLoss',
  downtime_ms: 'down',
  micro_stops_ms: 'micro',
  macro_stops_ms: 'macro',
  downtime_count: 'downCount',
  micro_stops_count: 'microCount',
  macro_stops_count: 'macroCount'
};

function addTo(sum, key, value) {
  if (value === null || value === undefined) {
    return;
  }
  sum[key] = (sum[key] || 0) + value;
}

function get(sum, key) {
  return sum[key] === undefined ? null : sum[key];
}

function minutes(sum, key) {
  return sum[key] === undefined ? null : sum[key] / MIN_MS;
}

function count(sum, key) {
  return sum[key] === undefined ? null : Math.round(sum[key]);
}

function ratio(a, b) {
  if (a === null || b === null || !b) {
    return null;
  }
  return a / b;
}

// Parts that fit in a time at the design speed of each hour.
function units(hours, ms) {
  var total = null;
  hours.forEach(function (h) {
    var time = h.values[ms];
    if (h.perMinute === null || time === null || time === undefined) {
      return;
    }
    total = (total || 0) + h.perMinute * time / MIN_MS;
  });
  return total;
}

// Hours of the day in runs of the same shift. A run ends at a shift change,
// a gap in the hours or an hour outside every shift.
function shiftRuns(hours) {
  var runs = [];
  var run = null;
  hours.forEach(function (h) {
    var continues = run && run.name === h.shift &&
      run.hours[run.hours.length - 1].ms + HOUR_MS === h.ms;
    if (continues) {
      run.hours.push(h);
      return;
    }
    run = null;
    if (h.shift !== null) {
      run = { name: h.shift, hours: [h] };
      runs.push(run);
    }
  });
  return runs;
}

var line = msg.h.line || msg.h.asset_name;
var level = msg.h.machine ? 'machine' : 'line';

function windowRow(kind, name, from, to, hours) {
  var s = {};
  hours.forEach(function (h) {
    Object.keys(SUMS).forEach(function (column) {
      addTo(s, SUMS[column], h.values[column]);
    });
  });
  var availability = ratio(get(s, 'net'), get(s, 'operational'));
  var performance = ratio(get(s, 'total'), get(s, 'theoretical'));
  var quality = ratio(get(s, 'good'), get(s, 'total'));
  var oee = null;
  if (availability !== null && performance !== null && quality !== null) {
    oee = availability * performance * quality;
  }
  var capacity = units(hours, 'operational_time_ms');
  var operational = minutes(s, 'operational');
  var speed = null;
  if (capacity !== null && operational) {
    speed = capacity / operational;
  }
  // The loss times of the OEE app are worked out on the window ratios, not
  // summed per hour: performance loss = (1 - performance) x net production
  // time, quality loss = (1 - quality) x (net - performance loss).
  var net = get(s, 'net');
  var perfLoss = null;
  if (performance !== null && net !== null) {
    perfLoss = (1 - performance) * net;
  }
  var netOperational = perfLoss === null ? null : net - perfLoss;
  var qualLoss = null;
  if (quality !== null && netOperational !== null) {
    qualLoss = (1 - quality) * netOperational;
  }
  var used = qualLoss === null ? null : netOperational - qualLoss;
  var perfLossMin = perfLoss === null ? null : perfLoss / MIN_MS;
  var qualLossMin = qualLoss === null ? null : qualLoss / MIN_MS;
  var perfLossUnits = null;
  var qualLossUnits = null;
  if (speed !== null && perfLossMin !== null) {
    perfLossUnits = perfLossMin * speed;
  }
  if (speed !== null && qualLossMin !== null) {
    qualLossUnits = qualLossMin * speed;
  }
  return {
    site: msg.h.site,
    line_id: msg.asset.id,
    line_name: line,
    asset_id: msg.asset.id,
    asset_name: msg.h.asset_name,
    asset_level: level,
    production_day: msg.day,
    window_kind: kind,
    window_name: name,
    window_start: from,
    window_end: to,
    hours: hours.length,
    oee: oee,
    availability: availability,
    performance: performance,
    quality: quality,
    total_parts: get(s, 'total'),
    good_parts: get(s, 'good'),
    rejected_parts: get(s, 'rejected'),
    theoretical_output: get(s, 'theoretical'),
    total_min: minutes(s, 'totalTime'),
    planned_stop_min: minutes(s, 'plannedStops'),
    operational_min: operational,
    net_production_min: minutes(s, 'net'),
    availability_loss_min: minutes(s, 'availLoss'),
    performance_loss_min: perfLossMin,
    quality_loss_min: qualLossMin,
    used_operational_min: used === null ? null : used / MIN_MS,
    downtime_min: minutes(s, 'down'),
    micro_stop_min: minutes(s, 'micro'),
    macro_stop_min: minutes(s, 'macro'),
    downtime_count: count(s, 'downCount'),
    micro_stop_count: count(s, 'microCount'),
    macro_stop_count: count(s, 'macroCount'),
    capacity_units: capacity,
    availability_loss_units: units(hours, 'availability_losses_ms'),
    performance_loss_units: perfLossUnits,
    quality_loss_units: qualLossUnits,
    design_speed_per_min: speed,
    running_rate: ratio(get(s, 'total'), minutes(s, 'net')),
    ran_min: null,
    fault_min: null,
    operator_min: null,
    waiting_min: null,
    planned_min: null,
    other_min: null,
    loaded_at: loadedAt
  };
}

msg.windowRows = [];
if (msg.hours.length) {
  msg.windowRows.push(
    windowRow('day', msg.day, msg.dayFromMs, msg.dayToMs, msg.hours)
  );
}
shiftRuns(msg.hours).forEach(function (run) {
  var first = run.hours[0].ms;
  var last = run.hours[run.hours.length - 1].ms;
  msg.windowRows.push(
    windowRow('shift', run.name, first, last + HOUR_MS, run.hours)
  );
});
delete msg.hours;
delete msg.kpiMeta;
return msg;
