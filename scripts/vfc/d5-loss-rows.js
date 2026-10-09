// Builds the pbi_daily_losses rows of one asset: one row per stop.
// In: msg.stops, msg.shiftRules, msg.h. Out: msg.lossRows and
// msg.droppedStops (stops that start outside the production day).
// Columns without data in Insights Hub (units, targets, product) are null.
var MIN_MS = 60000;
var DAY_MS = 86400000;
var HOUR_MS = 3600000;
var cfg = flow.get('cfg');
// The reason a stop gets when nobody chose one.
var DEFAULT_REASON = 'Unplanned Downtime';
var BREAKDOWN_CATEGORY = 'Breakdown';
var loadedAt = msg.loadedAt || Date.now();
// A production day D runs from D dayStartHour UTC to D+1 dayStartHour.
var midnight = Date.parse(msg.day + 'T00:00:00.000Z');
var fromMs = midnight + cfg.dayStartHour * HOUR_MS;
var toMs = fromMs + DAY_MS;
var month = msg.day.slice(0, 7);

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

function lossGroup(category, reason) {
  if (cfg.plannedRoots.indexOf(category) >= 0) {
    return 'Planned Loss';
  }
  if (reason === DEFAULT_REASON) {
    return 'Not Logged';
  }
  return 'Unplanned Loss';
}

// Only stops that start inside the production day are kept.
var lossRows = [];
var dropped = 0;
msg.stops.forEach(function (r) {
  var start = Date.parse(r.from);
  if (!(start >= fromMs && start < toMs)) {
    dropped++;
    return;
  }
  var parts = r.reasonFullPath ? String(r.reasonFullPath).split(' / ') : [];
  var category = parts.length > 1 ? parts[0] : null;
  var subgroup = parts.length > 2 ? parts[1] : null;
  var localMs = start + londonOffsetHours(start) * HOUR_MS;
  var localIso = new Date(localMs).toISOString();
  var duration = numOrNull(r.duration);
  lossRows.push({
    site_name: msg.h.site,
    machine_name: msg.h.asset_name,
    unique_machine_name: msg.asset.id,
    date: localIso.slice(0, 10),
    time: localIso.slice(11, 19),
    shift_start_date: msg.day,
    shift_name: shiftOf(start),
    duration: duration === null ? null : Math.round(duration) / MIN_MS,
    loss_units: null,
    loss_lvl3_group: lossGroup(category, r.reason || null),
    loss_lvl3_sub_group: category,
    loss_lvl3_desc: r.reason || null,
    loss_final_level: r.reason || null,
    equipment: subgroup,
    breakdown_types: category === BREAKDOWN_CATEGORY ? subgroup : null,
    batch_id: null,
    comment_count: numOrNull(r.commentCount),
    part_name: null,
    product_key: null,
    loss_target_key: msg.h.line + '|' + category + '|' + localIso.slice(0, 7),
    value: null,
    target: null,
    volume_key: msg.h.line + '|' + localIso.slice(0, 7),
    volume_total: null,
    loaded_at: loadedAt
  });
});

msg.lossRows = lossRows;
msg.droppedStops = dropped;
delete msg.stops;
return msg;
