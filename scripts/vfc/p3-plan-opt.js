// Builds the pbi_plan_opt and pbi_time_utilisation rows of one day.
// In: msg.tables (dim_asset, dim_shift, fact_kpi). Out: msg.planRows
// (machine x day x shift) and msg.utilRows (machine x day).
var MIN_MS = 60000;
var DAY_MS = 86400000;
var MINUTES_PER_DAY = 1440;
var loadedAt = Date.now();

function toMs(value) {
  return typeof value === 'number' ? value : Date.parse(value);
}

var calendarOf = {};
msg.tables.dim_asset.forEach(function (a) {
  calendarOf[a.asset_id] = a.calendar_id;
});

// The shift of an instant: the calendar event whose recurrence covers it.
function shiftOf(calendarId, ms) {
  var found = null;
  msg.tables.dim_shift.forEach(function (e) {
    if (found || e.calendar_id !== calendarId) {
      return;
    }
    var days = e.freq === 'WEEKLY' ? 7 : e.freq === 'DAILY' ? 1 : 0;
    var start = toMs(e.start_utc);
    var until = e.until_utc ? toMs(e.until_utc) : Infinity;
    if (!days || ms < start || ms > until) {
      return;
    }
    var step = days * e.interval * DAY_MS;
    var occurrence = start + Math.floor((ms - start) / step) * step;
    if (ms < occurrence + e.duration_ms) {
      found = e.shift_name;
    }
  });
  return found;
}

// Adds a value to a sum; a sum with no value at all stays null.
function addTo(sum, key, value) {
  if (value === null || value === undefined) {
    return;
  }
  sum[key] = (sum[key] || 0) + value;
}

function minutes(ms) {
  return ms === null || ms === undefined ? null : ms / MIN_MS;
}

var groups = {};
msg.tables.fact_kpi.forEach(function (k) {
  var shift = shiftOf(calendarOf[k.asset_id], toMs(k.period_start));
  var key = k.asset_id + '|' + k.production_day + '|' + shift;
  var g = groups[key];
  if (!g) {
    g = {
      first: k,
      shift: shift,
      sum: {},
      hours: 0
    };
    groups[key] = g;
  }
  g.hours += 1;
  addTo(g.sum, 'good', k.good_parts);
  var planned = k.planned_stop_shift_plan_ms;
  if (k.total_time_ms !== null && planned !== null) {
    addTo(g.sum, 'total', minutes(k.total_time_ms - planned));
  }
  addTo(g.sum, 'opt', minutes(k.operational_time_ms));
  addTo(g.sum, 'oee', minutes(k.used_operational_time_ms));
});

function sumOrNull(sum, key) {
  return sum[key] === undefined ? null : sum[key];
}

var planRows = [];
var utilByMachine = {};
Object.keys(groups).forEach(function (key) {
  var g = groups[key];
  var k = g.first;
  planRows.push({
    site_name: k.site,
    area_name: k.area,
    machine_name: k.asset_name,
    unique_machine_name: k.asset_id,
    date: k.production_day,
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
  });
  var u = utilByMachine[k.asset_id];
  if (!u) {
    u = { first: k, sum: {} };
    utilByMachine[k.asset_id] = u;
  }
  addTo(u.sum, 'total', g.sum.total);
  addTo(u.sum, 'opt', g.sum.opt);
  addTo(u.sum, 'oee', g.sum.oee);
});

var utilRows = Object.keys(utilByMachine).map(function (id) {
  var k = utilByMachine[id].first;
  var sum = utilByMachine[id].sum;
  return {
    site_name: k.site,
    machine_name: k.asset_name,
    unique_machine_name: k.asset_id,
    date: k.production_day,
    total_time_total: sumOrNull(sum, 'total'),
    planned_opt_total: sumOrNull(sum, 'opt'),
    oee_time_total: sumOrNull(sum, 'oee'),
    all_time: MINUTES_PER_DAY,
    loaded_at: loadedAt
  };
});

msg.planRows = planRows;
msg.utilRows = utilRows;
return msg;
