// Keeps every shift name once.
// In: msg.rows = the shift rows of all calendars (names repeat).
// Out: msg.rows = the distinct shift names, in the order first seen.
var seen = {};
msg.rows = msg.rows.filter(function (row) {
  if (seen[row.shift]) {
    return false;
  }
  seen[row.shift] = true;
  return true;
});
return msg;
