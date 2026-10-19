// Adds the minutes per group (ran, fault, waiting, planned, other) to the
// window rows of one machine. In: the time segments response. Out 1:
// msg.windowRows (operator_min stays null, there is no such category).
// Out 2: the asset result for the join when the call failed (no half days).
var MIN_MS = 60000;
// Time category of a segment -> column. Anything else (also a segment
// without a category) is counted as other.
var GROUP_OF = {
  'Run': 'ran_min',
  'Unplanned Downtime': 'fault_min',
  'Lack of resources': 'waiting_min',
  'Planned Downtime': 'planned_min'
};
var OTHER = 'other_min';
var name = msg.h.asset_name;
var body = msg.payload;

if (msg.statusCode !== 200 || !body || !Array.isArray(body.distribution)) {
  msg.payload = {
    assetId: msg.asset.id,
    name: name,
    failed: name + ': time segments failed, HTTP ' + msg.statusCode,
    skipped: null,
    windowRows: [],
    hourRows: [],
    eventRows: []
  };
  delete msg.windowRows;
  delete msg.hourRows;
  delete msg.shiftRules;
  delete msg.hourInfo;
  return [null, msg];
}

var segments = body.distribution.map(function (s) {
  return {
    from: Date.parse(s.from),
    to: Date.parse(s.to),
    column: GROUP_OF[s.timeCategoryName] || OTHER
  };
});
msg.windowRows.forEach(function (row) {
  var sums = {
    ran_min: 0,
    fault_min: 0,
    waiting_min: 0,
    planned_min: 0,
    other_min: 0
  };
  segments.forEach(function (s) {
    var start = Math.max(s.from, row.window_start);
    var end = Math.min(s.to, row.window_end);
    if (end > start) {
      sums[s.column] += (end - start) / MIN_MS;
    }
  });
  Object.keys(sums).forEach(function (column) {
    row[column] = sums[column];
  });
});
delete msg.payload;
return [msg, null];
