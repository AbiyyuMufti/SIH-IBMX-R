// Turns an error caught by the catch node into a log line.
// In: the message of a catch node (msg.error). Out 1: a log line for the
// shared log. Out 2: a failed read of the log file, for the append step.
// Errors of the log nodes themselves never go to out 1 (no log loop).
var err = msg.error || {};
var source = (err.source && err.source.name) || 'unknown node';

function textOf(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

// Takes the API message out of an error body when there is one.
function apiMessage(value) {
  var body = value;
  if (typeof value === 'string') {
    try {
      body = JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  var data = body && body.data;
  var list = (data && data.errors) || (body && body.errors);
  if (list && list.length && list[0].message) {
    return list[0].message;
  }
  return textOf(value);
}

var detail = apiMessage(err.message);

if (msg.logBatch) {
  if (msg.logStep === 'read') {
    msg.logReadError = detail;
    return [null, msg];
  }
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'log write failed'
  });
  return [null, null];
}

var text = '';
if (msg.day) {
  text += msg.day + ' [' + msg.mode + '] ';
}
text += 'ERROR in ' + source + ': ' + detail;
var line = {
  topic: 'log',
  payload: text,
  level: 'error',
  source: source
};
return [line, null];
