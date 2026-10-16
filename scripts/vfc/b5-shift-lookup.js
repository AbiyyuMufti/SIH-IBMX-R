// Builds the shift lookup from the Shift Patterns file.
// In: msg.payload = parsed rows (ShiftName, Shift). Stores flow context
// shiftMap: raw shift name -> Shift. Out 2: a failed item for an empty file.
var rows = Array.isArray(msg.payload) ? msg.payload : [];
if (rows.length && rows[0].ShiftName === undefined) {
  // a byte order mark can sit in the first column name
  rows = rows.map(function (row) {
    return {
      ShiftName: row['\uFEFFShiftName'],
      Shift: row.Shift
    };
  });
}
if (!rows.length || rows[0].ShiftName === undefined) {
  msg.payload = {
    failed: 'shift patterns: no ShiftName column or rows'
  };
  return [null, msg];
}

var map = {};
rows.forEach(function (row) {
  if (row.ShiftName !== undefined) {
    map[row.ShiftName] = row.Shift === undefined ? null : row.Shift;
  }
});
flow.set('shiftMap', map);
node.status({
  fill: 'green',
  shape: 'dot',
  text: Object.keys(map).length + ' raw shift names'
});
msg.payload = msg.site;
return [msg, null];
