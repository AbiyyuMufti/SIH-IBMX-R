// Logs one line per request and passes the answer on.
// In: the answer message (msg.statusCode, msg.mode, msg.key or msg.folder).
// Out 1: the answer for the http response node.
// Out 2: one log line. The key of the endpoint is never logged.
var MAX_TEXT = 200;

var query = (msg.req && msg.req.query) || {};
var status = msg.statusCode || 200;
var what = String(query.path || query.list || '').slice(0, MAX_TEXT);
var kind = query.list ? 'list' : 'file';

var text = 'GET ' + kind + ' ' + what + ' -> ' + status;
if (msg.size !== undefined) {
  text += ' (' + msg.size + (kind === 'list' ? ' objects)' : ' bytes)');
}

var level = 'info';
if (status >= 500) {
  level = 'failed';
} else if (status >= 400) {
  level = 'warn';
}

var line = {
  payload: text,
  level: level,
  source: 'lake-api'
};
return [msg, line];
