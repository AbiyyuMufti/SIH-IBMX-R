// Builds the result of one asset and hands it to the join.
// In: msg.planRows, utilRows, lossRows, droppedStops and unmapped.
// Out: msg.payload = {assetId, name, failed, skipped, planRows, utilRows,
// lossRows, unmapped, outside, note}. The note is one line for the day log.
var name = msg.h.asset_name;

var total = msg.utilRows.reduce(function (sum, x) {
  return sum + (x.total_time_total || 0);
}, 0);
var note = name + ': ' + msg.planRows.length + ' plan rows, ' +
  msg.lossRows.length + ' stops, sum total_time ' +
  (total / 60).toFixed(2) + ' h';
if (msg.droppedStops) {
  note += ', ' + msg.droppedStops + ' stops outside the day ignored';
}

msg.payload = {
  assetId: msg.asset.id,
  name: name,
  failed: null,
  skipped: null,
  planRows: msg.planRows,
  utilRows: msg.utilRows,
  lossRows: msg.lossRows,
  unmapped: msg.unmapped,
  outside: msg.droppedStops,
  note: note
};
delete msg.planRows;
delete msg.utilRows;
delete msg.lossRows;
delete msg.droppedStops;
delete msg.unmapped;
delete msg.shiftRules;
return msg;
