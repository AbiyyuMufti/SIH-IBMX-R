// Turns the calendar events into shift rules.
// In: the calendarEvents response. Out 1: msg.shiftRules = [{name, freq,
// interval, start, until, duration}] (epoch ms, null when open ended).
// Out 2: the asset result for the join when the call failed.
var name = msg.h.asset_name;
var events = msg.payload && msg.payload.calendarEvents;

if (msg.statusCode !== 200 || !Array.isArray(events)) {
  msg.payload = {
    assetId: msg.asset.id,
    name: name,
    failed: name + ': calendar events failed, HTTP ' + msg.statusCode,
    skipped: null,
    planRows: [],
    utilRows: [],
    lossRows: []
  };
  delete msg.hours;
  delete msg.kpiMeta;
  return [null, msg];
}

// Date text to epoch ms, null when missing or not a date.
function toMs(text) {
  var ms = Date.parse(text);
  return isNaN(ms) ? null : ms;
}

// An event without a recurrence object gets freq null and never matches.
msg.shiftRules = events.map(function (e) {
  var rule = e.rrule;
  if (!rule || typeof rule !== 'object') {
    rule = {};
  }
  return {
    name: e.name || null,
    freq: rule.freq || null,
    interval: rule.interval || null,
    start: toMs(rule.dtstart),
    until: toMs(rule.until),
    duration: Math.round(Number(e.duration))
  };
});
delete msg.payload;
return [msg, null];
