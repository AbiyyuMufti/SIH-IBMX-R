// Builds the pbi_daily_losses rows of one day, one row per stop.
// In: msg.tables (dim_asset, dim_shift, fact_loss). Out: msg.lossRows.
// Columns without data in Insights Hub (units, targets, product) are null.
var MIN_MS = 60000;
var DAY_MS = 86400000;
var HOUR_MS = 3600000;
var cfg = flow.get('cfg');
// The reason a stop gets when nobody chose one.
var DEFAULT_REASON = 'Unplanned Downtime';
var BREAKDOWN_CATEGORY = 'Breakdown';
var loadedAt = Date.now();

function toMs(value) {
  return typeof value === 'number' ? value : Date.parse(value);
}

var calendarOf = {};
msg.tables.dim_asset.forEach(function (a) {
  calendarOf[a.asset_id] = a.calendar_id;
});

// Same rule as in 3.1: which calendar event covers the instant.
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

// Last Sunday of the month at 01:00 UTC. The month is 0-based.
function lastSundayUtc(year, month) {
  var d = new Date(Date.UTC(year, month + 1, 0, 1, 0, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}

// Europe/London offset in hours (UK sites only).
function londonOffsetHours(ms) {
  var year = new Date(ms).getUTCFullYear();
  var inBst = ms >= lastSundayUtc(year, 2) && ms < lastSundayUtc(year, 9);
  return inBst ? 1 : 0;
}

function lossGroup(row) {
  if (cfg.plannedRoots.indexOf(row.reason_category) >= 0) {
    return 'Planned Loss';
  }
  if (row.reason === DEFAULT_REASON) {
    return 'Not Logged';
  }
  return 'Unplanned Loss';
}

msg.lossRows = msg.tables.fact_loss.map(function (r) {
  var startMs = toMs(r.event_start);
  var localIso = new Date(startMs + londonOffsetHours(startMs) * HOUR_MS)
    .toISOString();
  var month = r.local_date.slice(0, 7);
  var isBreakdown = r.reason_category === BREAKDOWN_CATEGORY;
  return {
    site_name: r.site,
    machine_name: r.asset_name,
    unique_machine_name: r.asset_id,
    date: r.local_date,
    time: localIso.slice(11, 19),
    shift_start_date: r.production_day,
    shift_name: shiftOf(calendarOf[r.asset_id], startMs),
    duration: r.duration_ms / MIN_MS,
    loss_units: null,
    loss_lvl3_group: lossGroup(r),
    loss_lvl3_sub_group: r.reason_category,
    loss_lvl3_desc: r.reason,
    loss_final_level: r.reason,
    equipment: r.reason_subgroup,
    breakdown_types: isBreakdown ? r.reason_subgroup : null,
    batch_id: null,
    comment_count: r.comment_count,
    part_name: null,
    product_key: null,
    loss_target_key: r.line + '|' + r.reason_category + '|' + month,
    value: null,
    target: null,
    volume_key: r.line + '|' + month,
    volume_total: null,
    loaded_at: loadedAt
  };
});
return msg;
