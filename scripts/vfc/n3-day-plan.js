// Step 3 of a day: choose the assets. Output 1 = array of assets (goes to the split node), output 2 = log.
var cfg = flow.get('cfg');
if (msg.statusCode !== 200 || !Array.isArray(msg.payload)) {
  return [null, { topic: 'log', payload: msg.day + ' [' + msg.mode + '] FAILED, NOTHING WRITTEN: OEE asset list failed, HTTP ' + msg.statusCode }];
}
var oee = msg.payload, byId = {}, skipped = [], targets = [];
oee.forEach(function (o) { byId[o.assetId] = o; });
var ids = cfg.assetIds && cfg.assetIds.length ? cfg.assetIds : oee.map(function (o) { return o.assetId; });
ids.forEach(function (id) {
  var o = byId[id];
  if (!o) { skipped.push(String(id).slice(0, 6) + '... not an OEE asset'); return; }
  if (o.isConfigured === false) { skipped.push(o.name + ' not configured'); return; }
  targets.push({ id: id, isManual: o.isManual, name: o.name });
});
msg.planSkipped = skipped;
if (!targets.length) {
  return [null, { topic: 'log', payload: msg.day + ' [' + msg.mode + '] NOTHING TO WRITE (no assets to read)' + (skipped.length ? ' | skipped: ' + skipped.join('; ') : '') }];
}
msg.payload = targets;
node.status({ fill: 'blue', shape: 'dot', text: msg.day + ': ' + targets.length + ' asset(s)' });
return [msg, null];
