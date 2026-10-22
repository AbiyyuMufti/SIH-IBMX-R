// Notes the time of the newest log line in global context "lastLog".
// In: every log line (a tap behind the log formatter). Out: nothing. A new
// line also clears the "done" flag, so the next quiet period is reported.
glob.set('lastLog', Date.now());
glob.set('done', false);
var status = glob.get('runStatus_pbi-report');
if (status) {
  var row = msg.payload || {};
  var line = String(row.message || msg.line || '');
  status.lastBeatAt = new Date().toISOString();
  status.lastLog = line.slice(0, 160);
  if (row.level === 'failed' || row.level === 'error') {
    status.state = 'failed';
  }
  glob.set('runStatus_pbi-report', status);
}
return null;
