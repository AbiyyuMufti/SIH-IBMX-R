// Sets the file path of one month: <out>/<table>/site=<Site>/<table>_
// <YYYY-MM>_<source>.parquet, <out> = report or candidate/<source> (1.1).
// In: the parquet node output (msg.table, msg.site, msg.month). Out: msg.path.
// The name is fixed per source: a rerun replaces only this source's month.
var cfg = flow.get('cfg');

msg.path = cfg.siteOut[msg.site] + '/' + msg.table + '/site=' + msg.site;
msg.path += '/' + msg.table + '_' + msg.month + '_' + cfg.source;
msg.path += '.parquet';
msg.filename = msg.path.split('/').pop();
return msg;
