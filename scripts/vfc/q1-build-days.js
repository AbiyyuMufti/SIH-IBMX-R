// Builds the production days of the shift report (23 to 25 hours, from
// dayStartLocal o'clock local time). One message per day, oldest first.
// In: the schedule inject or the backfill {start, end}.
// Out: {topic: 'day', payload: 'YYYY-MM-DD', mode, dayFromMs, dayToMs}.
var DAY_MS = 86400000;
var HOUR_MS = 3600000;
// The schedule builds a day this long after it ended.
var GRACE_HOURS = 2;
var cfg = flow.get('cfg');
var p = msg.payload;
var days = [];
var mode;

function dayStr(ms) {
  return new Date(ms).toISOString().slice(0, 10);
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

// UTC instant of dayStartLocal o'clock on the local day that begins on the
// UTC date dayMs. Right for a start from 02:00 (checked in node 1.1).
function startOf(dayMs) {
  var asUtc = dayMs + cfg.dayStartLocal * HOUR_MS;
  return asUtc - londonOffsetHours(asUtc) * HOUR_MS;
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
    days.push(t);
  }
} else {
  mode = 'schedule';
  var now = Date.now();
  // The latest day that ended at least GRACE_HOURS ago.
  var latest = Math.floor(now / DAY_MS) * DAY_MS;
  while (startOf(latest + DAY_MS) + GRACE_HOURS * HOUR_MS > now) {
    latest -= DAY_MS;
  }
  for (var i = cfg.rebuildDays; i >= 0; i--) {
    days.push(latest - i * DAY_MS);
  }
}

var text = mode + ': ' + days.length + ' day(s) ' + dayStr(days[0]);
if (days.length > 1) {
  text += ' .. ' + dayStr(days[days.length - 1]);
}
node.status({ fill: 'blue', shape: 'dot', text: text });
var messages = days.map(function (d) {
  return {
    topic: 'day',
    payload: dayStr(d),
    mode: mode,
    dayFromMs: startOf(d),
    dayToMs: startOf(d + DAY_MS)
  };
});
return [messages];
