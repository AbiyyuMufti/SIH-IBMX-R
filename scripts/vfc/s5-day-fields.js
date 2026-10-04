// Adds production_day and local_date (text YYYY-MM-DD) to every row.
// In: msg.kpiRows (from period_start) and msg.lossRows (from event_start).
// Out: the same rows with the two day columns.
var HOUR_MS = 3600000;
// A production day D runs from D 06:00Z to D+1 06:00Z.
var PRODUCTION_DAY_START_HOURS = 6;

// Last Sunday of the month at 01:00 UTC. The month is 0-based.
function lastSundayUtc(year, month) {
  var d = new Date(Date.UTC(year, month + 1, 0, 1, 0, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}

// Europe/London offset in hours for a UTC instant. BST runs from the last
// Sunday of March 01:00 UTC to the last Sunday of October 01:00 UTC.
function londonOffsetHours(ms) {
  var year = new Date(ms).getUTCFullYear();
  var inBst = ms >= lastSundayUtc(year, 2) && ms < lastSundayUtc(year, 9);
  return inBst ? 1 : 0;
}

function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Rows arrive as epoch ms or as ISO text (messages are serialised).
function toMs(value) {
  return typeof value === 'number' ? value : Date.parse(value);
}

function addDays(rows, startKey) {
  rows.forEach(function (row) {
    var ms = toMs(row[startKey]);
    row.production_day = ymd(ms - PRODUCTION_DAY_START_HOURS * HOUR_MS);
    row.local_date = ymd(ms + londonOffsetHours(ms) * HOUR_MS);
  });
}

addDays(msg.kpiRows, 'period_start');
addDays(msg.lossRows, 'event_start');
return msg;
