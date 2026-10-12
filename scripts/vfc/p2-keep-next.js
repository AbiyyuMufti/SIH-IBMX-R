// Keeps the rows that were just read and sets the next file to read.
// In: msg.payload = the rows (from the join after the parquet read node).
// Out: msg.tables.__KEEP__ = the rows, msg.path = the file of __NEXT__.
var KEEP = '__KEEP__';
var NEXT = '__NEXT__';
var cfg = flow.get('cfg');
// The join before this node gives a list of rows. If the parquet node
// already sent a list per file, the join gives a list of lists: flatten it.
var rows = msg.payload;
if (Array.isArray(rows) && rows.length && Array.isArray(rows[0])) {
  rows = [].concat.apply([], rows);
}
if (!Array.isArray(rows)) {
  node.error(KEEP + ': the file did not give a list of rows', msg);
  return null;
}
msg.tables[KEEP] = rows;
delete msg.payload;
if (NEXT) {
  msg.path = cfg.paths[NEXT].replace('YYYY-MM-DD', msg.day);
}
return msg;
