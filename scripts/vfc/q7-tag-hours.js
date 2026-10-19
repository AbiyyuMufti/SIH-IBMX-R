// Gives every hour its shift and its design speed.
// In: msg.hours (with hour.product from node 7.1) and msg.shiftRules.
// Out: hour.ms (start in ms), hour.shift (name or null) and
// hour.perMinute (design speed per minute or null) on every hour.
var DAY_MS = 86400000;
var HOUR_MS = 3600000;

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

msg.hours.forEach(function (hour) {
  hour.ms = Date.parse(hour.time);
  hour.shift = shiftOf(hour.ms);
  var product = hour.product;
  var speed = product ? product.per_minute : null;
  hour.perMinute = speed === undefined ? null : speed;
});
return msg;
