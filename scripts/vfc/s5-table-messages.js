// Builds one message per table for the parquet nodes.
// In: msg.kpiRows, msg.lossRows and msg.writeNote. Out 1: fact_kpi rows.
// Out 2: fact_loss rows. Out 3: log line. A table without rows sends nothing.
var day = msg.day;

// The parquet node needs epoch ms for TIMESTAMP_MILLIS columns. Rows arrive
// as ISO text because messages are serialised between nodes.
function toMsColumns(rows, keys) {
  return rows.map(function (row) {
    var copy = Object.assign({}, row);
    keys.forEach(function (k) {
      var v = copy[k];
      if (v !== null && v !== undefined) {
        copy[k] = typeof v === 'number' ? v : Date.parse(v);
      }
    });
    return copy;
  });
}

var kpiRows = toMsColumns(
  msg.kpiRows,
  ['period_start', 'period_end', 'loaded_at']
);
var lossRows = toMsColumns(
  msg.lossRows,
  ['event_start', 'event_end', 'loaded_at']
);
var kpiMsg = null;
if (kpiRows.length) {
  kpiMsg = { topic: 'fact_kpi', day: day, payload: kpiRows };
}
var lossMsg = null;
if (lossRows.length) {
  lossMsg = { topic: 'fact_loss', day: day, payload: lossRows };
}
node.status({
  fill: 'green',
  shape: 'dot',
  text: day + ' ' + kpiRows.length + '/' + lossRows.length
});
var line = {
  topic: 'log',
  payload: day + ' [' + msg.mode + '] ' + msg.writeNote
};
return [kpiMsg, lossMsg, line];
