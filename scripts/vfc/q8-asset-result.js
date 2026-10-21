// Builds the result of one asset and hands it to the join.
// In: msg.windowRows, hourRows, eventRows, droppedStops and unmapped.
// Out: msg.payload = {assetId, name, failed, skipped, windowRows, hourRows,
// eventRows, unmapped, outside, note}. The note is one line for the day log.
var name = msg.h.asset_name;

var note = name + ': ' + msg.windowRows.length + ' windows, ' +
  msg.hourRows.length + ' hours, ' + msg.eventRows.length + ' events';
if (msg.droppedStops) {
  note += ', ' + msg.droppedStops + ' stops outside the day ignored';
}
if (msg.kpiHourParts) {
  note += ', KPIs in ' + msg.kpiHourParts + ' hourly parts (413 on the day)';
}

msg.payload = {
  assetId: msg.asset.id,
  name: name,
  failed: null,
  skipped: null,
  windowRows: msg.windowRows,
  hourRows: msg.hourRows,
  eventRows: msg.eventRows,
  unmapped: msg.unmapped,
  outside: msg.droppedStops,
  note: note
};
delete msg.windowRows;
delete msg.hourRows;
delete msg.eventRows;
delete msg.droppedStops;
delete msg.unmapped;
delete msg.shiftRules;
return msg;
