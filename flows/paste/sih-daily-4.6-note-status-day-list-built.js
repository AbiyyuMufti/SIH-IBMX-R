// Updates one small live status entry in global context.
// In: a report message; out: the same message, unchanged.
// queue writes queued, running, an asset count, or an hourly-part count.
var FLOW_NAME = 'sih-hull';
var SITE_NAME = 'Hull';
var STEP = 'day list built';
var ACTION = 'queue';
var KEY = 'runStatus_' + FLOW_NAME;
var MAX_DAYS = 100;
var KEEP_DAYS_MS = 7 * 86400000;
// A day of an older run with no checkpoint for this long is dead.
var DEAD_AFTER_MS = 30 * 60 * 1000;
// Steps an open day remembers (step, asset, time), to find a lost asset.
var TRAIL_MAX = 14;

function finished(state) {
  return state === 'written' || state === 'dry_run' ||
    state === 'failed' || state === 'nothing' || state === 'interrupted';
}

function prune(status, now) {
  var keys = Object.keys(status.days);
  keys.forEach(function (day) {
    var item = status.days[day];
    var touched = Date.parse(item.stepAt || status.startedAt || now);
    if (finished(item.state) && now - touched > KEEP_DAYS_MS) {
      delete status.days[day];
    }
  });
  keys = Object.keys(status.days);
  if (keys.length > MAX_DAYS) {
    keys.sort(function (a, b) {
      return Date.parse(status.days[a].stepAt || '') -
        Date.parse(status.days[b].stepAt || '');
    });
    keys.slice(0, keys.length - MAX_DAYS).forEach(function (day) {
      delete status.days[day];
    });
  }
}

var now = new Date().toISOString();
var nowMs = Date.parse(now);
var status = glob.get(KEY) || {
  flow: FLOW_NAME,
  site: SITE_NAME,
  dryRun: true,
  runId: '',
  mode: '',
  startedAt: now,
  lastBeatAt: now,
  days: {}
};
var cfg = flow.get('cfg') || {};
status.flow = FLOW_NAME;
status.site = SITE_NAME;
status.dryRun = cfg.dryRun !== false;
status.lastBeatAt = now;

if (ACTION === 'queue') {
  status.state = 'running';
  if (status.runId !== msg.runId) {
    Object.keys(status.days).forEach(function (name) {
      var old = status.days[name];
      var touched = Date.parse(old.stepAt || '');
      var open = old.state === 'running' || old.state === 'queued';
      if (open && isFinite(touched) && nowMs - touched > DEAD_AFTER_MS) {
        old.state = 'interrupted';
        old.detail = 'run stopped before this day finished';
      }
    });
    status.runId = msg.runId || now;
    status.mode = msg.mode || '';
    status.startedAt = msg.startedAt || now;
  }
  var queued = msg.day || msg.payload;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(queued))) {
    status.days[queued] = {
      state: 'queued',
      step: 'queued',
      stepAt: now,
      detail: '',
      assetsDone: 0,
      assetsTotal: 0,
      partsDone: 0,
      partsTotal: 0
    };
  }
} else {
  var day = msg.day || (msg.topic === 'day' ? msg.payload : null);
  var item = status.days[day];
  if (day && !item) {
    item = {
      state: 'running',
      step: STEP,
      stepAt: now,
      detail: '',
      assetsDone: 0,
      assetsTotal: 0,
      partsDone: 0,
      partsTotal: 0
    };
    status.days[day] = item;
  }
  // Only DAY SETUP (re)starts a day: a late checkpoint of another asset
  // must not turn a finished day back into running.
  if (item && ACTION === 'running' &&
      (!finished(item.state) || STEP === 'DAY SETUP')) {
    item.state = 'running';
    item.step = STEP;
    item.stepAt = now;
    item.detail = '';
  }
  if (item && ACTION === 'asset-done') {
    item.assetsDone = (item.assetsDone || 0) + 1;
    item.assetsTotal = msg.parts && msg.parts.count ?
      msg.parts.count : item.assetsTotal;
    item.step = STEP;
    item.stepAt = now;
  }
  if (item && ACTION === 'part-done') {
    item.partsDone = (item.partsDone || 0) + 1;
    item.partsTotal = msg.parts && msg.parts.count ?
      msg.parts.count : item.partsTotal;
    item.step = STEP;
    item.stepAt = now;
  }
}

// Open days keep a short trail: which asset reached which step.
function assetName() {
  if (msg.asset && msg.asset.name) {
    return msg.asset.name;
  }
  if (msg.h && msg.h.asset_name) {
    return msg.h.asset_name;
  }
  return msg.payload && msg.payload.name ? msg.payload.name : '';
}

if (item && ACTION !== 'queue' && !finished(item.state)) {
  item.trail = item.trail || [];
  item.trail.push([STEP, assetName(), now.slice(11, 19)].join(' | '));
  if (item.trail.length > TRAIL_MAX) {
    item.trail.splice(0, item.trail.length - TRAIL_MAX);
  }
}
// A late checkpoint of a finished day must not reopen the whole flow.
if (item && !finished(item.state)) {
  status.state = 'running';
}
prune(status, nowMs);
glob.set(KEY, status);
return msg;
