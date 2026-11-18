// Splits a request of Power Automate into rows. In: msg.payload = one Base
// row (object) or a list of Base rows. Out 1: the row messages, one per row.
// Out 2: the answer (400 bad list, 503 reference not loaded, 200 accepted).

// Most rows one request may carry (the last days of one workbook).
var MAX_ROWS = 10;

function reply(code, tag, detail) {
  msg.statusCode = code;
  msg.payload = {
    status: tag,
    detail: detail
  };
  msg.logLevel = code === 200 ? 'info' : 'warn';
  msg.logText = tag + ': ' + detail;
  return [null, msg];
}

var body = msg.payload;
// One row: unchanged, the next nodes answer when the row is built.
if (!Array.isArray(body)) {
  return [msg, null];
}

if (!body.length || body.length > MAX_ROWS) {
  var detail = 'a list takes 1 to ' + MAX_ROWS + ' rows, it has ';
  detail += body.length;
  return reply(400, 'rejected', detail);
}
var notRows = body.filter(function (row) {
  return !row || typeof row !== 'object' || Array.isArray(row);
});
if (notRows.length) {
  return reply(400, 'rejected', 'every item of the list must be an object');
}

// The reference check of the row lane comes after the answer of a list, so
// it is done here: the sender sends the whole list again on 503.
var ready = flow.get('chartres_ready');
if (!ready || !ready.at) {
  return reply(503, 'not ready', 'reference files are loading, send again');
}

// The row messages carry no http response: the row lane only logs them.
var rows = body.map(function (row) {
  return {
    topic: msg.topic,
    payload: row
  };
});
node.status({
  fill: 'green',
  shape: 'dot',
  text: body.length + ' rows'
});
return [rows, reply(200, 'accepted', body.length + ' rows, see the log')[1]];
