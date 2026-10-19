// Builds the rpt_event rows of one asset: one row per stop of the day.
// In: msg.stops, shiftRules, hourInfo, h, asset, day, dayFromMs, dayToMs.
// Out: msg.eventRows and msg.droppedStops (stops that start outside the
// day). Product and order come from the hour of the stop.
var MIN_MS = 60000;
var DAY_MS = 86400000;
var HOUR_MS = 3600000;
var MICROSTOPS = '##MICROSTOPS##';
var cfg = flow.get('cfg');
var loadedAt = msg.loadedAt || Date.now();

// The shift of an instant: the event whose recurrence covers it, else null.
// The calendar rules hold local wall clock times written with a Z (a shift
// of 06:00 local starts at 05:00 UTC in summer), so the instant is looked
// up on its local wall clock time.
function shiftOf(instant) {
  var ms = instant + londonOffsetHours(instant) * HOUR_MS;
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

function numOrNull(v) {
  if (v === null || v === undefined || v === '') {
    return null;
  }
  var n = Number(v);
  return isFinite(n) ? n : null;
}

// The first part of the reason path decides: planned or unplanned.
function eventKind(stop) {
  if (stop.reason === MICROSTOPS) {
    return 'microstop';
  }
  var path = String(stop.reasonFullPath || stop.reason || '');
  var root = path.split(' / ')[0];
  return cfg.plannedRoots.indexOf(root) >= 0 ? 'planned' : 'unplanned';
}

var line = msg.h.line || msg.h.asset_name;
var level = msg.h.machine ? 'machine' : 'line';
var hourInfo = msg.hourInfo || {};
var eventRows = [];
var dropped = 0;
msg.stops.forEach(function (r) {
  var start = Date.parse(r.from);
  if (!(start >= msg.dayFromMs && start < msg.dayToMs)) {
    dropped++;
    return;
  }
  var local = new Date(start + londonOffsetHours(start) * HOUR_MS);
  var localIso = local.toISOString();
  var duration = numOrNull(r.duration);
  var minutes = duration === null ? null : Math.round(duration) / MIN_MS;
  var info = hourInfo[String(Math.floor(start / HOUR_MS) * HOUR_MS)] || {};
  var product = info.product || {};
  var perMinute = product.per_minute;
  var units = null;
  if (minutes !== null && perMinute !== null && perMinute !== undefined) {
    units = minutes * perMinute;
  }
  eventRows.push({
    site: msg.h.site,
    line_id: msg.lineId || msg.asset.id,
    line_name: line,
    asset_id: msg.asset.id,
    asset_name: msg.h.asset_name,
    asset_level: level,
    production_day: msg.day,
    event_start: start,
    event_end: r.to ? Date.parse(r.to) : null,
    local_date: localIso.slice(0, 10),
    local_time: localIso.slice(11, 19),
    shift_name: shiftOf(start),
    event_kind: eventKind(r),
    reason: r.reason || null,
    reason_path: r.reasonPath || null,
    reason_full_path: r.reasonFullPath || null,
    minutes: minutes,
    occurrence: numOrNull(r.occurrence),
    comment_count: numOrNull(r.commentCount),
    batch_id: info.order || null,
    part_name: product.part_name || null,
    product_key: product.product_key || null,
    loss_units: units,
    loaded_at: loadedAt
  });
});

msg.eventRows = eventRows;
msg.droppedStops = dropped;
delete msg.stops;
delete msg.hourInfo;
return msg;
