// Sets the file path of one month in the data lake.
// In: the output of the parquet node (msg.table, msg.site, msg.month kept).
// Out: msg.path = <out>/<table>/site=<Site>/<table>_<YYYY-MM>.parquet. The name
// is fixed, so a rerun replaces the month.
var cfg = flow.get('cfg');

msg.path = cfg.outRoot + '/' + msg.table + '/site=' + msg.site + '/';
msg.path += msg.table + '_' + msg.month + '.parquet';
msg.filename = msg.path.split('/').pop();
return msg;
