// Matches the wanted ids (msg.ids) with the master list, to get the names.
// In: the list response. Out 1: msg.payload = [{id, name, extra}] for the
// split node. Out 2: a log line. LIST_KEY is the array inside the response.
var LIST_KEY = '__LIST_KEY__';
var NAME_FIELD = 'name';
var EXTRA_FIELD = '__EXTRA_FIELD__';
var byId = {};
var targets = [];
var notInList = [];

function logMessage(text) {
  return {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] ' + text
  };
}

var list = msg.payload;
if (LIST_KEY && list) {
  list = list[LIST_KEY];
}
if (msg.statusCode !== 200 || !Array.isArray(list)) {
  var failed = 'FAILED, NOTHING WRITTEN: master list failed, HTTP ';
  return [null, logMessage(failed + msg.statusCode)];
}

list.forEach(function (entry) {
  byId[entry.id] = entry;
});
msg.ids.forEach(function (id) {
  var entry = byId[id];
  if (!entry) {
    notInList.push(String(id).slice(0, 6) + '...');
  }
  targets.push({
    id: id,
    name: entry ? entry[NAME_FIELD] : null,
    extra: entry && EXTRA_FIELD ? entry[EXTRA_FIELD] : null
  });
});
if (notInList.length) {
  var note = ' | not in master list: ' + notInList.join(', ');
  msg.planSkipped = (msg.planSkipped || []).concat(note);
}
msg.payload = targets;
delete msg.ids;
node.status({
  fill: 'blue',
  shape: 'dot',
  text: targets.length + ' id(s)'
});
return [msg, null];
