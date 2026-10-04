// Builds the result of one asset and hands it to the join.
// In: msg.kpiRows, msg.lossRows, msg.droppedStops and msg.unmapped.
// Out: msg.payload = {assetId, name, failed, skipped, kpiRows, lossRows,
// unmapped, outside, note}. The note is one line for the day log.
var HOUR_MS = 3600000;
var name = msg.h.asset_name;

var total = msg.kpiRows.reduce(function (sum, x) {
  return sum + (x.total_time_ms || 0);
}, 0);
var note = name + ': ' + msg.kpiRows.length + ' kpi rows, ' +
  msg.lossRows.length + ' stops, sum total_time ' +
  (total / HOUR_MS).toFixed(2) + ' h';
if (msg.droppedStops) {
  note += ', ' + msg.droppedStops + ' stops outside the day ignored';
}

msg.payload = {
  assetId: msg.asset.id,
  name: name,
  failed: null,
  skipped: null,
  kpiRows: msg.kpiRows,
  lossRows: msg.lossRows,
  unmapped: msg.unmapped,
  outside: msg.droppedStops,
  note: note
};
delete msg.kpiRows;
delete msg.lossRows;
delete msg.droppedStops;
delete msg.unmapped;
return msg;
