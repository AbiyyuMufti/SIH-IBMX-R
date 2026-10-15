// Builds the shift rows from the Shift Patterns file.
// In: msg.payload = the parsed rows (ShiftName, Shift).
// Out: msg.payload = an item {name, failed, skipped, rows}: one row per line
// of the file; the distinct step after the collect keeps each shift once.
var item = {
  name: 'shift patterns',
  failed: null,
  skipped: null,
  rows: []
};
var rows = Array.isArray(msg.payload) ? msg.payload : [];
if (!rows.length || rows[0].Shift === undefined) {
  item.failed = 'shift patterns: no Shift column or rows';
  msg.payload = item;
  return msg;
}

rows.forEach(function (row) {
  var shift = String(row.Shift === undefined ? '' : row.Shift).trim();
  if (shift) {
    item.rows.push({
      shift: shift,
      loaded_at: msg.loadedAt
    });
  }
});
msg.payload = item;
return msg;
