// Splits a day evaluateKPIs call that answered 413 into hourly calls.
// In: the 413 answer, msg.asset, msg.token, msg.dayFromMs, msg.dayToMs and
// msg.job (a product or order call) or none (the day call). Out: one request
// per hour of the day, all in one group (msg.parts) for the join.
var cfg = flow.get('cfg');
// The length of one part. The day window is split into parts this long.
var PART_HOURS = 1;
var HOUR_MS = 3600000;

// The filters of the original call: the product or order of msg.job (same
// as the value KPI request), else the plain day call.
function filters() {
  if (!msg.job) {
    return [{ key: 'PRODUCT', value: [] }];
  }
  function filterFor(key) {
    return {
      key: key,
      value: msg.job.key === key ? [msg.job.value] : []
    };
  }
  return [
    filterFor('PRODUCT'),
    filterFor('ORDER'),
    { key: 'SHIFT', value: [] }
  ];
}

var windows = [];
for (var t = msg.dayFromMs; t < msg.dayToMs; t += PART_HOURS * HOUR_MS) {
  windows.push([t, Math.min(t + PART_HOURS * HOUR_MS, msg.dayToMs)]);
}

// The day join of the flow uses msg.parts too: keep it aside.
msg.dayParts = msg.parts;
var group = msg.asset.id + '|' + msg.day + '|' + Date.now() + '|';
group += Math.floor(Math.random() * 1000000);
delete msg.payload;
var out = windows.map(function (w, index) {
  var copy = JSON.parse(JSON.stringify(msg));
  copy.method = 'POST';
  copy.url = cfg.oeeBase + '/expressions/evaluateKPIs';
  copy.headers = {
    'Authorization': 'Bearer ' + msg.token,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  copy.payload = {
    assetId: msg.asset.id,
    scope: {
      from: new Date(w[0]).toISOString(),
      to: new Date(w[1]).toISOString(),
      filter: filters(),
      recursive: false,
      groupedByDateTime: true
    }
  };
  copy.parts = {
    id: group,
    index: index,
    count: windows.length,
    type: 'array'
  };
  return copy;
});
node.status({
  fill: 'yellow',
  shape: 'dot',
  text: msg.asset.name + ': 413, ' + out.length + ' hourly parts'
});
return [out];
