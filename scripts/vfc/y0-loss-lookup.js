// Builds the loss names lookup from the file chartres-losses.csv.
// In: msg.payload = parsed rows (Line, Column, Group, Sub Group, Description,
// Equipment). Stores flow context losses_Chartres: Line|Column -> [group,
// sub group, description, equipment]. Out 2: a failed item.
var rows = Array.isArray(msg.payload) ? msg.payload : [];

// A byte order mark can sit in the first column name.
function clean(row) {
  var out = {};
  Object.keys(row).forEach(function (column) {
    out[column.replace(/﻿/g, '')] = row[column];
  });
  return out;
}

var lookup = {};
var kept = 0;
rows.map(clean).forEach(function (row) {
  if (!row.Line || !row.Column) {
    return;
  }
  lookup[row.Line + '|' + row.Column] = [
    row.Group,
    row['Sub Group'],
    row.Description,
    row.Equipment
  ];
  kept++;
});
if (!kept) {
  msg.payload = {
    failed: 'loss names: no Line / Column rows'
  };
  return [null, msg];
}
flow.set('losses_Chartres', lookup);
node.status({
  fill: 'green',
  shape: 'dot',
  text: kept + ' loss names'
});
msg.payload = 'Chartres';
return [msg, null];
