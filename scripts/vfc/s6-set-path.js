// Sets the file path in the data lake for the table __TABLE__.
// In: the output of the parquet node (msg.payload is passed on unchanged).
// Out: the same message with msg.path and msg.filename. The text YYYY-MM-DD
// in the path becomes the production day, so a rerun replaces the file.
var cfg = flow.get('cfg');
msg.path = cfg.paths.__TABLE__.replace('YYYY-MM-DD', msg.day);
msg.filename = msg.path.split('/').pop();
return msg;
