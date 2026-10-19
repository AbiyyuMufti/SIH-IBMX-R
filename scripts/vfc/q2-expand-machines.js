// Turns the report lines into the lines plus their machines (OEE assets
// below them, not in reportExcludeNames), one message per asset.
// In: msg.payload = [{line, statusCode, body}]. Out 1: one message per asset
// with msg.parts for the day join. Out 2: a log line when a list failed.
var cfg = flow.get('cfg');
var exclude = cfg.excludeMachineNames || [];
var skipped = msg.planSkipped || [];
var assets = [];
var problems = [];

// Step 1: the line and its machines. A machine is a child that is a
// configured OEE asset and is not excluded.
msg.payload.forEach(function (entry) {
  var line = entry.line;
  var body = entry.body;
  if (entry.statusCode !== 200 || !body || typeof body !== 'object') {
    problems.push(line.name + ': machine list failed, HTTP ' +
      entry.statusCode);
    return;
  }
  if (body.page && body.page.totalPages > 1) {
    problems.push(line.name + ': more than one page of machines');
    return;
  }
  assets.push({ asset: line, lineId: line.id, lineName: line.name });
  var kids = (body._embedded && body._embedded.assets) || [];
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
    assets.push({
      asset: { id: kid.assetId, isManual: oee.isManual, name: oee.name },
      lineId: line.id,
      lineName: line.name
    });
  });
});

// Step 2: a failed machine list stops the day (no half days).
if (problems.length) {
  var text = 'FAILED, NOTHING WRITTEN: ' + problems.join(' | ');
  return [null, {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] ' + text
  }];
}

// Step 3: one message per asset, all in one group for the join.
msg.planSkipped = skipped;
delete msg.payload;
delete msg.parts;
delete msg.oeeById;
var group = msg.day + '|' + Date.now() + '|';
group += Math.floor(Math.random() * 1000000);
var out = assets.map(function (item, index) {
  var copy = JSON.parse(JSON.stringify(msg));
  copy.payload = item.asset;
  copy.lineId = item.lineId;
  copy.lineName = item.lineName;
  copy.parts = {
    id: group,
    index: index,
    count: assets.length,
    type: 'array'
  };
  return copy;
});
node.status({
  fill: 'blue',
  shape: 'dot',
  text: msg.day + ': ' + assets.length + ' asset(s)'
});
return [out, null];
