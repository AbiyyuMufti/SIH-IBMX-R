// Build the list of production days. One message per day leaves this node (oldest first).
var cfg = flow.get('cfg');
var p = msg.payload;
var days = [], mode;
function dayStr(ms) { return new Date(ms).toISOString().slice(0, 10); }
if (p && typeof p === 'object' && p.start && p.end) {
  mode = 'backfill';
  var s = Date.parse(p.start + 'T00:00:00Z'), e = Date.parse(p.end + 'T00:00:00Z');
  if (isNaN(s) || isNaN(e) || e < s) { node.error('Backfill needs {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"} with start <= end', msg); return null; }
  for (var t = s; t <= e; t += 86400000) days.push(dayStr(t));
} else {
  mode = 'schedule';
  var now = Date.now();
  // Production day D runs D 06:00Z to D+1 06:00Z. At 07:00Z the latest finished production day is the one before the current one.
  var latest = Date.parse(dayStr(now - 6 * 3600000 - 86400000) + 'T00:00:00Z');
  for (var i = cfg.rebuildDays; i >= 0; i--) days.push(dayStr(latest - i * 86400000));
}
node.status({ fill: 'blue', shape: 'dot', text: mode + ': ' + days.length + ' day(s) ' + days[0] + (days.length > 1 ? ' .. ' + days[days.length - 1] : '') });
return [days.map(function (d) { return { topic: 'day', payload: d, mode: mode }; })];
