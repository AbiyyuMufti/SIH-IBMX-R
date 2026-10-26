// Runs on the clock. Reports "JOB DONE" once per build tab, when no log line
// of that tab came for QUIET_SECONDS. In: nothing (inject). Out: one message
// per tab that turned quiet. The log lines are noted by the build tabs.
var QUIET_SECONDS = 30;
var FLOWS = [
  'pbi-report',
  'pbi-report-2'
];

var messages = [];
FLOWS.forEach(function (flowName) {
  var last = glob.get('lastLog_' + flowName);
  if (!last || glob.get('done_' + flowName)) {
    return;
  }
  var quiet = (Date.now() - last) / 1000;
  if (quiet < QUIET_SECONDS) {
    return;
  }
  glob.set('done_' + flowName, true);
  var status = glob.get('runStatus_' + flowName);
  if (status) {
    if (status.state !== 'failed') {
      status.state = 'quiet';
    }
    status.finishedAt = new Date().toISOString();
    status.lastBeatAt = status.finishedAt;
    glob.set('runStatus_' + flowName, status);
  }
  messages.push({
    payload: 'JOB DONE ' + flowName + ': no log line for ' +
      Math.round(quiet) + ' s'
  });
});
if (!messages.length) {
  return null;
}
node.status({
  fill: 'green',
  shape: 'dot',
  text: 'quiet: ' + messages.length + ' tab(s)'
});
return [messages];
