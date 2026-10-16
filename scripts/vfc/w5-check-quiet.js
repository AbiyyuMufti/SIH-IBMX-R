// Runs on the clock. Reports "JOB DONE" once, when no log line came for
// QUIET_SECONDS. In: nothing (inject). Out: msg.payload = the text.
var QUIET_SECONDS = 30;
var last = flow.get('lastLog');
var done = flow.get('done');
if (!last || done) {
  return null;
}

var quiet = (Date.now() - last) / 1000;
if (quiet < QUIET_SECONDS) {
  return null;
}
flow.set('done', true);
node.status({
  fill: 'green',
  shape: 'dot',
  text: 'quiet since ' + new Date(last).toISOString().slice(11, 19)
});
return {
  payload: 'JOB DONE: no log line for ' + Math.round(quiet) + ' s'
};
