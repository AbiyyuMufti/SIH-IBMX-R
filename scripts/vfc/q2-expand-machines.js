// Turns a report line into the line plus its machines (OEE assets below it,
// not in reportExcludeNames of Config). In: the children of the line.
// Out 1: one message per asset, payload {id, isManual, name}. Out 2: the
// asset result for the wait node when the call failed. State: dayRuns.
var cfg = flow.get('cfg');
var STALE_MS = 21600000;
var exclude = cfg.excludeMachineNames || [];
var line = msg.line;
var runKey = msg.day + '|' + msg.parts.id;

// Step 1: the state of the day. Runs that never finished are forgotten.
var now = Date.now();
var runs = flow.get('dayRuns') || {};
Object.keys(runs).forEach(function (k) {
  if (now - runs[k].created > STALE_MS) {
    delete runs[k];
  }
});
var run = runs[runKey] || {
  created: now,
  lines: msg.parts.count,
  linesSeen: 0,
  expected: 0,
  arrived: 0,
  results: []
};
runs[runKey] = run;
run.linesSeen += 1;

function failed(text) {
  run.expected += 1;
  flow.set('dayRuns', runs);
  msg.runKey = runKey;
  msg.payload = {
    assetId: line.id,
    name: line.name,
    failed: text,
    skipped: null,
    windowRows: [],
    hourRows: [],
    eventRows: []
  };
  delete msg.parts;
  delete msg.oeeById;
  delete msg.line;
  return [null, msg];
}

var body = msg.payload;
if (msg.statusCode !== 200 || !body || typeof body !== 'object') {
  return failed(line.name + ': machine list failed, HTTP ' + msg.statusCode);
}
if (body.page && body.page.totalPages > 1) {
  return failed(line.name + ': more than one page of machines');
}

// Step 2: the machines. Only configured OEE assets, minus the exclusions.
var kids = (body._embedded && body._embedded.assets) || [];
var assets = [{ id: line.id, isManual: line.isManual, name: line.name }];
var skipped = msg.planSkipped || [];
kids.sort(function (a, b) {
  return String(a.name).localeCompare(String(b.name));
});
kids.forEach(function (kid) {
  var oee = msg.oeeById[kid.assetId];
  if (!oee) {
    return;
  }
  if (oee.isConfigured === false) {
    skipped.push(oee.name + ' not configured');
    return;
  }
  if (exclude.indexOf(oee.name) >= 0) {
    skipped.push(oee.name + ' excluded');
    return;
  }
  assets.push({ id: kid.assetId, isManual: oee.isManual, name: oee.name });
});
msg.planSkipped = skipped;

// Step 3: one message per asset, all with the same run key.
run.expected += assets.length;
flow.set('dayRuns', runs);
delete msg.payload;
delete msg.parts;
delete msg.oeeById;
delete msg.line;
msg.runKey = runKey;
var out = assets.map(function (asset) {
  var copy = JSON.parse(JSON.stringify(msg));
  copy.payload = asset;
  copy.lineId = line.id;
  copy.lineName = line.name;
  return copy;
});
node.status({
  fill: 'blue',
  shape: 'dot',
  text: line.name + ': ' + (assets.length - 1) + ' machine(s)'
});
return [out, null];
