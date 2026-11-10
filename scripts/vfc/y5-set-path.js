// Sets the file path of one table, line and day: <report>/<table>/site=
// Chartres/<table>_<YYYY-MM-DD>_<line>_excel.parquet. In: the parquet node
// output (msg.iso, msg.machine). Out: msg.path and msg.filename.
// The name is fixed: a resend of the same line and day replaces the file.
var TABLE = '__TABLE__';
var cfg = flow.get('cfg');

msg.path = cfg.liveFolder + '/' + TABLE + '/site=' + cfg.site;
msg.path += '/' + TABLE + '_' + msg.iso + '_' + msg.machine;
msg.path += '_' + cfg.source + '.parquet';
msg.filename = msg.path.split('/').pop();
return msg;
