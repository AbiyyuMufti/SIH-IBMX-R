// Keeps the rows that were just read and sets the next file to read.
// In: msg.payload = the rows of the parquet read node.
// Out: msg.tables.__KEEP__ = the rows, msg.path = the file of __NEXT__.
var KEEP = '__KEEP__';
var NEXT = '__NEXT__';
var cfg = flow.get('cfg');
if (!Array.isArray(msg.payload)) {
  node.error(KEEP + ': the file did not give a list of rows', msg);
  return null;
}
msg.tables[KEEP] = msg.payload;
delete msg.payload;
if (NEXT) {
  msg.path = cfg.paths[NEXT].replace('YYYY-MM-DD', msg.day);
}
return msg;
