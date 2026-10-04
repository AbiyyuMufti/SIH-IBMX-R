// Builds the dim_shift rows of one calendar (one row per calendar event).
// In: the calendarEvents response and msg.target (extra = time zone text).
// Out: msg.payload = an item {name, failed, skipped, rows} for the join.
var target = msg.target;
var label = target.name || String(target.id).slice(0, 6) + '...';
var item = {
  name: label,
  failed: null,
  skipped: null,
  rows: []
};

var events = msg.payload && msg.payload.calendarEvents;
if (msg.statusCode !== 200 || !Array.isArray(events)) {
  var text = 'calendar ' + label + ' failed, HTTP ';
  item.failed = text + msg.statusCode;
  msg.payload = item;
  return msg;
}

// Date text to epoch ms, null when missing or not a date.
function toMs(text) {
  var ms = Date.parse(text);
  if (isNaN(ms)) {
    return null;
  }
  return ms;
}

events.forEach(function (e) {
  var rule = e.rrule;
  if (!rule || typeof rule !== 'object') {
    rule = {};
  }
  item.rows.push({
    calendar_id: target.id,
    calendar_name: target.name,
    time_zone_text: target.extra,
    event_id: e.id,
    shift_name: e.name || null,
    description: e.description || null,
    time_model_category_id: e.timeModelCategoryId || null,
    duration_ms: Math.round(Number(e.duration)),
    freq: rule.freq || null,
    interval: rule.interval || null,
    start_utc: toMs(rule.dtstart),
    until_utc: toMs(rule.until),
    loaded_at: msg.loadedAt
  });
});
msg.payload = item;
return msg;
