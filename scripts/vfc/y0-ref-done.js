// Counts the lookups of one refresh. In: msg.type, msg.runId and msg.payload
// (the site name, or {failed}). When all types are in and none failed, the
// reference is ready for the requests. Out: a log line when the run ends.
var run = flow.get('chartres_run');
if (!run || run.id !== msg.runId) {
  return null;
}

var failed = msg.payload && msg.payload.failed;
if (failed) {
  run.failed.push(String(failed));
}
run.done[msg.type] = true;
flow.set('chartres_run', run);
if (Object.keys(run.done).length < run.total) {
  return null;
}

var text = 'reference loaded';
var level = 'info';
if (run.failed.length) {
  text = 'reference FAILED: ' + run.failed.join('; ');
  level = 'failed';
} else {
  flow.set('chartres_ready', {
    at: Date.now()
  });
}
node.status({
  fill: level === 'info' ? 'green' : 'red',
  shape: 'dot',
  text: text.slice(0, 40)
});
var day = new Date().toISOString().slice(0, 10);
return {
  payload: day + ' [reference] ' + text,
  level: level,
  source: 'chartres-live'
};
