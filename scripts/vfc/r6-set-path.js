// Sets the file path in the data lake.
// In: the output of the parquet node (msg.payload is passed on unchanged).
// Out: the same message with msg.path and msg.filename. The file name is
// fixed, so every run replaces the file and never duplicates it.
var cfg = flow.get('cfg');
msg.path = cfg.path;
msg.filename = msg.path.split('/').pop();
return msg;
