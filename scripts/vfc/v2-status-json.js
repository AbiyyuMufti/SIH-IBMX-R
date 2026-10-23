// Builds a JSON snapshot of the small global run-status records.
// In: an authenticated status request.
// Out: JSON with a derived STUCK state after 30 minutes without a checkpoint.
var STUCK_AFTER_MS = 30 * 60 * 1000;
var now = Date.now();
// The monitored flows: the builder fills in scripts/monitor-flows.js.
var MONITOR_FLOWS = __MONITOR_FLOWS__;
var keys = MONITOR_FLOWS.map(function (item) {
  return 'runStatus_' + item.id;
});
var flows = {};

function active(status) {
  if (status.state === 'running' || status.state === 'queued') {
    return true;
  }
  var days = status.days || {};
  return Object.keys(days).some(function (day) {
    return days[day].state === 'running' ||
      days[day].state === 'queued';
  });
}

function snapshot(key) {
  var stored = glob.get(key);
  if (!stored || typeof stored !== 'object') {
    return {
      state: 'not started'
    };
  }

  var copy = JSON.parse(JSON.stringify(stored));
  var running = active(copy);
  copy.state = copy.state || (running ? 'running' : 'idle');
  var beat = Date.parse(copy.lastBeatAt || copy.startedAt || '');
  if (running && isFinite(beat) && now - beat > STUCK_AFTER_MS) {
    copy.state = 'STUCK';
    copy.stuck = true;
    Object.keys(copy.days || {}).forEach(function (day) {
      var item = copy.days[day];
      if (item.state === 'running' || item.state === 'queued') {
        item.state = 'STUCK';
      }
    });
  } else {
    copy.stuck = false;
  }
  return copy;
}

keys.forEach(function (key) {
  flows[key.replace('runStatus_', '')] = snapshot(key);
});
var cfg = glob.get('cfg');
flows.config = cfg && cfg.platform && Array.isArray(cfg.sites) ?
  {
    state: 'ready',
    platform: cfg.platform,
    sites: cfg.sites.length
  } : {
    state: 'unavailable'
  };

msg.statusCode = 200;
msg.headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};
msg.payload = {
  generatedAt: new Date(now).toISOString(),
  stuckAfterMs: STUCK_AFTER_MS,
  flows: flows,
  commands: glob.get('runMonitorCommands') || []
};
return msg;
