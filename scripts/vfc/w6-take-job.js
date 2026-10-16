// Runs on a clock. Takes the oldest job that the lake watcher queued in
// global context "jobQueue" and sends it to node 1.1 like the inject does.
// One job per tick, so queued jobs run one after another.
var queue = glob.get('jobQueue') || [];
if (!queue.length) {
  return null;
}

var job = queue.shift();
glob.set('jobQueue', queue);
node.status({
  fill: 'green',
  shape: 'dot',
  text: queue.length + ' more queued'
});
return {
  topic: 'listener job',
  payload: job
};
