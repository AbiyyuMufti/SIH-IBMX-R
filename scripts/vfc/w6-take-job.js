// Runs on a clock. Takes the oldest job that the lake watcher queued in
// global context QUEUE and sends it to node 1.1 like the inject does.
// One job per tick, so queued jobs run one after another.
var QUEUE = '__QUEUE__';
var queue = glob.get(QUEUE) || [];
if (!queue.length) {
  return null;
}

var job = queue.shift();
glob.set(QUEUE, queue);
var status = glob.get('runStatus_pbi-listener') || {};
status.flow = 'pbi-listener';
status.state = 'listening';
status.lastBeatAt = new Date().toISOString();
status.queuedJobs = queue.length;
glob.set('runStatus_pbi-listener', status);
node.status({
  fill: 'green',
  shape: 'dot',
  text: queue.length + ' more queued'
});
return {
  topic: 'listener job',
  payload: job
};
