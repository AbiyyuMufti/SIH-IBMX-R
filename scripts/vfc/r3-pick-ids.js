// Collects the distinct ids of the assets. The field to read is ID_FIELD.
// In: msg.payload = array of items. Out 1: msg.ids (list of ids).
// Out 2: a log line when an item failed or there is no id at all.
var ID_FIELD = '__FIELD__';
var seen = {};
var ids = [];
var failures = [];
var without = [];

function logMessage(text) {
  return {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] ' + text
  };
}

msg.payload.forEach(function (item) {
  if (item.failed) {
    failures.push(item.failed);
    return;
  }
  var id = item[ID_FIELD];
  if (!id) {
    without.push(item.name);
    return;
  }
  if (!seen[id]) {
    seen[id] = true;
    ids.push(id);
  }
});

if (failures.length) {
  var failed = 'FAILED, NOTHING WRITTEN: ' + failures.join(' | ');
  return [null, logMessage(failed)];
}
if (!ids.length) {
  var nothing = 'NOTHING TO WRITE (no ids found)';
  if (without.length) {
    nothing += ' | assets without id: ' + without.join(', ');
  }
  return [null, logMessage(nothing)];
}
if (without.length) {
  var note = ' | assets without id: ' + without.join(', ');
  msg.planSkipped = (msg.planSkipped || []).concat(note);
}
msg.ids = ids;
delete msg.payload;
return [msg, null];
