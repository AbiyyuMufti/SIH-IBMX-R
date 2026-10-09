// Builds the shift name rows of one calendar: one row per event name.
// In: the calendarEvents response and msg.target (the calendar id).
// Out: msg.payload = an item {name, failed, skipped, rows} for the join.
var target = msg.target;
var label = 'calendar ' + String(target.id).slice(0, 6) + '...';
var item = {
  name: label,
  failed: null,
  skipped: null,
  rows: []
};

var events = msg.payload && msg.payload.calendarEvents;
if (msg.statusCode !== 200 || !Array.isArray(events)) {
  item.failed = label + ' failed, HTTP ' + msg.statusCode;
  msg.payload = item;
  return msg;
}

events.forEach(function (e) {
  if (e.name) {
    item.rows.push({
      shift: e.name,
      loaded_at: msg.loadedAt
    });
  }
});
msg.payload = item;
return msg;
