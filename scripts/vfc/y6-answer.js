// Answers the sender and logs the request. In: msg.statusCode, msg.payload
// (the answer), msg.logText, msg.logLevel, msg.row. Out 1: the http response
// (only for a request with msg.res). Out 2: one log line.
var cfg = flow.get('cfg') || {};
var status = msg.statusCode || 200;

// An error caught in the request lane: answer 500, Power Automate retries.
if (msg.error && !msg.statusCode) {
  status = 500;
  msg.payload = {
    status: 'error',
    detail: String(msg.error.message || msg.error).slice(0, 200)
  };
  msg.logText = 'error in ' + (msg.error.source && msg.error.source.name) +
    ': ' + String(msg.error.message || msg.error).slice(0, 200);
}

var day = msg.row && msg.row.iso;
if (!day) {
  day = new Date().toISOString().slice(0, 10);
}
var mode = cfg.dryRun ? 'dry-run' : 'live';
var text = msg.logText || ('answer ' + status);
var level = msg.logLevel || 'info';
if (status >= 500) {
  level = 'failed';
}
var line = {
  payload: day + ' [' + mode + '] ' + text,
  level: level,
  source: 'chartres-live'
};

if (!msg.res) {
  return [null, line];
}
var answer = {
  _msgid: msg._msgid,
  req: msg.req,
  res: msg.res,
  statusCode: status,
  headers: {
    'content-type': 'application/json'
  },
  payload: msg.payload
};
return [answer, line];
