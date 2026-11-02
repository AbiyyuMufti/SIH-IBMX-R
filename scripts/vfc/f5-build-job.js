// Checks the run and builds the job of the two PBI report build tabs.
// In: msg.payload = the task results {site, type, day, ok, rows} (join).
// Out 1: the job {sites, days} (to a wait, then the BACKFILL links of the
// build tabs), not in dry run. Out 2: the summary log line.
var TYPES = 4;
var cfg = flow.get('cfg') || {};
var run = flow.get('fetchRun') || {};
var results = Array.isArray(msg.payload) ? msg.payload : [];

// A day is built when every report type of a site came back.
var okCount = {};
results.forEach(function (r) {
  if (r && r.ok) {
    var key = r.site + '|' + r.day;
    okCount[key] = (okCount[key] || 0) + 1;
  }
});
var days = (run.days || []).filter(function (day) {
  return (run.sites || []).some(function (site) {
    return okCount[site + '|' + day] === TYPES;
  });
});
var failed = results.filter(function (r) {
  return r && !r.ok;
}).length;
var lost = (run.expected || 0) - results.length;

var line = new Date().toISOString().slice(0, 10) + ' [fetch] run: ';
line += results.length + ' of ' + run.expected + ' calls back';
if (failed || lost > 0) {
  line += ', FAILED ' + failed + ' calls, ' + Math.max(lost, 0) + ' lost';
}
line += ', days to build: ' + (days.length ? days.join(', ') : 'none');
if (cfg.dryRun) {
  line += ' (dry run: no build)';
}

var job = null;
if (days.length && !cfg.dryRun) {
  job = {
    topic: 'provideam fetch',
    payload: {
      sites: run.sites,
      days: days
    }
  };
}
node.status({
  fill: failed || lost > 0 ? 'red' : 'green',
  shape: 'dot',
  text: days.length + ' day(s) to build'
});
return [
  job,
  {
    topic: 'log',
    payload: line
  }
];
