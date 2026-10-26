// Sets the file path of a table with one file per site (no month):
// <report>/<table>/site=<Site>/<table>.parquet. In: the parquet node output
// (msg.table, msg.site). Out: msg.path. A rerun replaces the site's file.
var cfg = flow.get('cfg');

msg.path = cfg.liveFolder + '/' + msg.table + '/site=' + msg.site;
msg.path += '/' + msg.table + '.parquet';
msg.filename = msg.path.split('/').pop();
return msg;
