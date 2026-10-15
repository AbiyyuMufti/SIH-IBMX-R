// Turns a failed item into a log line. In: msg.payload = {failed: text}
// (a file that was not found or empty). Out: the log line. Nothing is built
// for the site, so no table file is written for it in this run.
var line = {
  topic: 'log',
  payload: msg.day + ' [' + msg.mode + '] FAILED, NOTHING WRITTEN: ' +
    msg.payload.failed
};
return line;
