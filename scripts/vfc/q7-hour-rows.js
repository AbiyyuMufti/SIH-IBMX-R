// Builds the rpt_hour rows of one asset: one row per hour of the day.
// In: msg.hours (tagged by node 7.2), msg.h, msg.asset, msg.day.
// Out: msg.hourRows. Minutes are KPI milliseconds divided by 60000.
var MIN_MS = 60000;
var HOUR_MS = 3600000;
var loadedAt = msg.loadedAt || Date.now();

// Last Sunday of the month at 01:00 UTC. The month is 0-based.
function lastSundayUtc(year, monthIndex) {
  var d = new Date(Date.UTC(year, monthIndex + 1, 0, 1, 0, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}

// Europe/London offset in hours (UK sites only).
function londonOffsetHours(ms) {
  var year = new Date(ms).getUTCFullYear();
  var inBst = ms >= lastSundayUtc(year, 2) && ms < lastSundayUtc(year, 9);
  return inBst ? 1 : 0;
}

function minutes(ms) {
  return ms === null || ms === undefined ? null : ms / MIN_MS;
}

function ratio(a, b) {
  if (a === null || a === undefined || !b) {
    return null;
  }
  return a / b;
}

var line = msg.h.line || msg.h.asset_name;
var level = msg.h.machine ? 'machine' : 'line';
msg.hourRows = msg.hours.map(function (hour) {
  var v = hour.values;
  var local = new Date(hour.ms + londonOffsetHours(hour.ms) * HOUR_MS);
  var localIso = local.toISOString();
  var product = hour.product || {};
  var operational = minutes(v.operational_time_ms);
  var net = minutes(v.net_production_time_ms);
  var capacity = null;
  if (hour.perMinute !== null && operational !== null) {
    capacity = hour.perMinute * operational;
  }
  return {
    site: msg.h.site,
    line_id: msg.lineId || msg.asset.id,
    line_name: line,
    asset_id: msg.asset.id,
    asset_name: msg.h.asset_name,
    asset_level: level,
    production_day: msg.day,
    hour_start: hour.ms,
    hour_end: hour.ms + HOUR_MS,
    local_date: localIso.slice(0, 10),
    local_time: localIso.slice(11, 16),
    shift_name: hour.shift,
    product_key: product.product_key || null,
    part_name: product.part_name || null,
    batch_id: hour.order || null,
    total_parts: v.total_parts,
    good_parts: v.good_parts,
    rejected_parts: v.rejected_parts,
    operational_min: operational,
    net_production_min: net,
    availability_loss_min: minutes(v.availability_losses_ms),
    downtime_min: minutes(v.downtime_ms),
    micro_stop_min: minutes(v.micro_stops_ms),
    design_speed_per_min: hour.perMinute,
    speed_per_min: ratio(v.total_parts, net),
    capacity_units: capacity,
    loaded_at: loadedAt
  };
});
return msg;
