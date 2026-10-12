// Starts one day: sets the path of the first file to read.
// In: msg.payload = the production day (YYYY-MM-DD) from the day list.
// Out: msg.day, msg.path = dim_asset file, msg.tables = {} (filled later).
// msg.topic = the day, so the join after each parquet read keeps days apart.
var cfg = flow.get('cfg');
msg.day = msg.payload;
msg.topic = msg.day;
msg.tables = {};
msg.path = cfg.paths.dim_asset.replace('YYYY-MM-DD', msg.day);
delete msg.payload;
return msg;
