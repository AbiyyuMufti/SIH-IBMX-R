// Finds the requested month file in the listed log folder.
// In: msg.payload = list objects result; msg.historyName = exact filename.
// Out: read object, 404 when absent, or 502 for an invalid list response.
if (!Array.isArray(msg.payload)) {
  msg.statusCode = 502;
  msg.headers = {
    'content-type': 'application/json'
  };
  msg.payload = {
    error: 'the data lake did not return a history folder list'
  };
  return [null, null, msg];
}

var found = msg.payload.filter(function (item) {
  return String(item.key || '').split('/').pop() === msg.historyName;
})[0];

if (!found) {
  msg.statusCode = 404;
  msg.headers = {
    'content-type': 'application/json'
  };
  msg.payload = {
    error: 'history file not found',
    flow: msg.historyFlow,
    month: msg.historyMonth
  };
  return [null, msg, null];
}

msg.path = found.key;
return [msg, null, null];
