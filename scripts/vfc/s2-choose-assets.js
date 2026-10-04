// Chooses the assets to read for the day.
// In: the OEE asset list. Out 1: msg.payload = [{id, isManual, name}] for
// the split node. Out 2: a log message when nothing can be read.
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

var oee = msg.payload;
oee.forEach(function (o) {
  byId[o.assetId] = o;
});
var ids = cfg.assetIds;
if (!ids || !ids.length) {
  ids = oee.map(function (o) {
    return o.assetId;
  });
}
ids.forEach(function (id) {
  var o = byId[id];
  if (!o) {
    skipped.push(String(id).slice(0, 6) + '... not an OEE asset');
    return;
  }
  if (o.isConfigured === false) {
    skipped.push(o.name + ' not configured');
    return;
  }
  targets.push({ id: id, isManual: o.isManual, name: o.name });
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
  text: msg.day + ': ' + targets.length + ' asset(s)'
});
return [msg, null];
