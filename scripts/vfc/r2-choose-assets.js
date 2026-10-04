// Chooses the assets to read for a reference table.
// In: the OEE asset list. Out 1: msg.payload = [{id, name, isManual,
// isConfigured, reasonTreeId}] for the next node. Out 2: a log message.
var KEEP_UNCONFIGURED = __KEEP__;
var cfg = flow.get('cfg');
var byId = {};
var skipped = [];
var targets = [];

function logMessage(text) {
  return {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] ' + text
  };
}

if (msg.statusCode !== 200 || !Array.isArray(msg.payload)) {
  var failed = 'FAILED, NOTHING WRITTEN: OEE asset list failed, HTTP ';
  return [null, logMessage(failed + msg.statusCode)];
}

msg.payload.forEach(function (o) {
  byId[o.assetId] = o;
});
var ids = cfg.assetIds;
if (!ids || !ids.length) {
  ids = msg.payload.map(function (o) {
    return o.assetId;
  });
}
ids.forEach(function (id) {
  var o = byId[id];
  if (!o) {
    skipped.push(String(id).slice(0, 6) + '... not an OEE asset');
    return;
  }
  if (cfg.excludeNames.indexOf(o.name) >= 0) {
    skipped.push(o.name + ' excluded');
    return;
  }
  if (o.isConfigured === false && !KEEP_UNCONFIGURED) {
    skipped.push(o.name + ' not configured');
    return;
  }
  targets.push({
    id: id,
    name: o.name,
    isManual: o.isManual,
    isConfigured: o.isConfigured !== false,
    reasonTreeId: o.reasonTreeId || null
  });
});
msg.planSkipped = skipped;

if (!targets.length) {
  var nothing = 'NOTHING TO WRITE (no assets to read)';
  if (skipped.length) {
    nothing += ' | skipped: ' + skipped.join('; ');
  }
  return [null, logMessage(nothing)];
}
msg.payload = targets;
node.status({
  fill: 'blue',
  shape: 'dot',
  text: targets.length + ' asset(s)'
});
return [msg, null];
