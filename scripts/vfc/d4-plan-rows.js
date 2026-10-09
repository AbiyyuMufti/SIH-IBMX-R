// Builds the Power BI rows of one asset and one production day from the
// hourly KPIs: pbi_plan_opt (per shift) and pbi_time_utilisation (per day).
// In: msg.hours, msg.shiftRules, msg.h. Out: msg.planRows, msg.utilRows.
var MIN_MS = 60000;
var DAY_MS = 86400000;
var MINUTES_PER_DAY = 1440;
var loadedAt = msg.loadedAt || Date.now();

// The shift of an instant: the event whose recurrence covers it, else null.
function shiftOf(ms) {
  var found = null;
  msg.shiftRules.forEach(function (rule) {
    if (found) {
      return;
    }
    var days = 0;
    if (rule.freq === 'DAILY') {
      days = 1;
    } else if (rule.freq === 'WEEKLY') {
      days = 7;
    }
    var until = rule.until === null ? Infinity : rule.until;
    if (!days || rule.start === null || ms < rule.start || ms > until) {
      return;
    }
    var step = days * rule.interval * DAY_MS;
    var occurrence = rule.start + Math.floor((ms - rule.start) / step) * step;
    if (ms < occurrence + rule.duration) {
      found = rule.name;
    }
  });
  return found;
}

// Adds a value to a sum. A sum with no value at all stays null.
function addTo(sum, key, value) {
  if (value === null || value === undefined) {
    return;
  }
  sum[key] = (sum[key] || 0) + value;
}

function minutes(ms) {
  return ms === null || ms === undefined ? null : ms / MIN_MS;
}

function sumOrNull(sum, key) {
  return sum[key] === undefined ? null : sum[key];
}

var groups = {};
var order = [];
msg.hours.forEach(function (hour) {
  var shift = shiftOf(Date.parse(hour.time));
  var key = String(shift);
  var g = groups[key];
  if (!g) {
    g = {
      shift: shift,
      sum: {},
      hours: 0
    };
    groups[key] = g;
    order.push(key);
  }
  var v = hour.values;
  g.hours += 1;
  addTo(g.sum, 'good', v.good_parts);
  var planned = v.planned_stop_shift_plan_ms;
  if (v.total_time_ms !== null && planned !== null) {
    addTo(g.sum, 'total', minutes(v.total_time_ms - planned));
  }
  addTo(g.sum, 'opt', minutes(v.operational_time_ms));
  addTo(g.sum, 'oee', minutes(v.used_operational_time_ms));
});

var daySum = {};
msg.planRows = order.map(function (key) {
  var g = groups[key];
  addTo(daySum, 'total', g.sum.total);
  addTo(daySum, 'opt', g.sum.opt);
  addTo(daySum, 'oee', g.sum.oee);
  return {
    site_name: msg.h.site,
    area_name: msg.h.area,
    machine_name: msg.h.asset_name,
    unique_machine_name: msg.asset.id,
    date: msg.day,
    shift_name: g.shift,
    part_name: null,
    product_key: null,
    good_parts: sumOrNull(g.sum, 'good'),
    capacity: null,
    downtime_units: null,
    total_time: sumOrNull(g.sum, 'total'),
    planned_opt: sumOrNull(g.sum, 'opt'),
    oee_time: sumOrNull(g.sum, 'oee'),
    oee_target: null,
    pdt_target: null,
    updt_target: null,
    source_hours: g.hours,
    loaded_at: loadedAt
  };
});

msg.utilRows = [];
if (order.length) {
  msg.utilRows.push({
    site_name: msg.h.site,
    machine_name: msg.h.asset_name,
    unique_machine_name: msg.asset.id,
    date: msg.day,
    total_time_total: sumOrNull(daySum, 'total'),
    planned_opt_total: sumOrNull(daySum, 'opt'),
    oee_time_total: sumOrNull(daySum, 'oee'),
    all_time: MINUTES_PER_DAY,
    loaded_at: loadedAt
  });
}
delete msg.hours;
delete msg.kpiMeta;
return msg;
