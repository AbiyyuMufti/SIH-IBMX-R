// Sets the file path of one table and production day: <out>/<table>/
// site=<Site>/<table>_<YYYY-MM-DD>_<source>.parquet. In: the parquet node
// output (msg.out, topic = table, day). Out: msg.path and msg.filename.
// The name is fixed per source and day: a rerun replaces only this file.
var cfg = flow.get('cfg');

msg.path = msg.out + '/' + msg.topic + '/site=' + cfg.site;
msg.path += '/' + msg.topic + '_' + msg.day + '_' + cfg.source;
msg.path += '.parquet';
msg.filename = msg.path.split('/').pop();
return msg;
