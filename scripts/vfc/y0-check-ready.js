// Stops a request while the reference files are not loaded (after a deploy
// the refresh needs a few seconds). In: msg.row. Out 1: the request goes on.
// Out 2: answer 503, so Power Automate sends the row again.
var ready = flow.get('chartres_ready');
if (ready && ready.at) {
  return [msg, null];
}

msg.statusCode = 503;
msg.payload = {
  status: 'not ready',
  detail: 'reference files are loading, send again'
};
msg.logLevel = 'warn';
msg.logText = 'not ready: reference files not loaded yet';
return [null, msg];
