// Notes the time of the newest log line of the tab in global context
// lastLog_<flow>. In: every log line (a tap behind the log formatter). Out:
// nothing. A new line clears done_<flow>, so the next quiet period is shown.
var FLOW = '__FLOW__';
glob.set('lastLog_' + FLOW, Date.now());
glob.set('done_' + FLOW, false);
var status = glob.get('runStatus_' + FLOW);
if (status) {
  var row = msg.payload || {};
  var line = String(row.message || msg.line || '');
  status.lastBeatAt = new Date().toISOString();
  status.lastLog = line.slice(0, 160);
  if (row.level === 'failed' || row.level === 'error') {
    status.state = 'failed';
  }
  glob.set('runStatus_' + FLOW, status);
}
return null;
