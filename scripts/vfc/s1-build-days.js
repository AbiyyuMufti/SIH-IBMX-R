// Builds the list of production days. One message leaves per day, oldest first.
// In: the schedule inject (any payload) or the backfill inject
// {start, end}. Out: {topic: 'day', payload: 'YYYY-MM-DD', mode}.
var DAY_MS = 86400000;
var HOUR_MS = 3600000;
var cfg = flow.get('cfg');
// A production day D runs from D start hour to D+1 start hour (UTC).
var PRODUCTION_DAY_START_HOURS = cfg.dayStartHour;
var p = msg.payload;
var days = [];
var mode;

function dayStr(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

if (p && typeof p === 'object' && p.start && p.end) {
  mode = 'backfill';
  var s = Date.parse(p.start + 'T00:00:00Z');
  var e = Date.parse(p.end + 'T00:00:00Z');
  if (isNaN(s) || isNaN(e) || e < s) {
    node.error(
      'Backfill needs {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"} ' +
        'with start <= end',
      msg
    );
    return null;
  }
  for (var t = s; t <= e; t += DAY_MS) {
    days.push(dayStr(t));
  }
} else {
  mode = 'schedule';
  var now = Date.now();
  // One hour after the day start the latest finished production day is the
  // one before the current one.
  var shifted = now - PRODUCTION_DAY_START_HOURS * HOUR_MS - DAY_MS;
  var latest = Date.parse(dayStr(shifted) + 'T00:00:00Z');
  for (var i = cfg.rebuildDays; i >= 0; i--) {
    days.push(dayStr(latest - i * DAY_MS));
  }
}

var text = mode + ': ' + days.length + ' day(s) ' + days[0];
if (days.length > 1) {
  text += ' .. ' + days[days.length - 1];
}
node.status({ fill: 'blue', shape: 'dot', text: text });
var messages = days.map(function (d) {
  return { topic: 'day', payload: d, mode: mode };
});
return [messages];
