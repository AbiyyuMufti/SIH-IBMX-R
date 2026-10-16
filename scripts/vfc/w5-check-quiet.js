// Runs on the clock. Reports "JOB DONE" once, when no log line came for
// QUIET_SECONDS. In: nothing (inject). Out: msg.payload = the text.
// The log lines are noted in global context by the tab PBI report build.
var QUIET_SECONDS = 30;
var last = glob.get('lastLog');
var done = glob.get('done');
if (!last || done) {
  return null;
}

var quiet = (Date.now() - last) / 1000;
if (quiet < QUIET_SECONDS) {
  return null;
}
glob.set('done', true);
node.status({
  fill: 'green',
  shape: 'dot',
  text: 'quiet since ' + new Date(last).toISOString().slice(11, 19)
});
return {
  payload: 'JOB DONE: no log line for ' + Math.round(quiet) + ' s'
};
