// Starts one reference refresh: one message per reference file type.
// In: the refresh trigger. Out: msg.payload = the list of types, msg.runId.
var TYPES = [
  'machines',
  'glidepaths',
  'formats',
  'scope',
  'losses'
];

var runId = Date.now();
flow.set('chartres_run', {
  id: runId,
  total: TYPES.length,
  done: {},
  failed: []
});
msg.runId = runId;
msg.payload = TYPES;
return msg;
