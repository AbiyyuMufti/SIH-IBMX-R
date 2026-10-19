// Waits until every asset of the day has delivered its result (a join node
// cannot, the number of assets is known after the machines are found).
// In: one asset result (msg.payload) with msg.runKey from node 2.6.
// Out: when all are in, one message with msg.payload = array of results.
var runs = flow.get('dayRuns') || {};
var run = runs[msg.runKey];
if (!run) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'result of an unknown day run dropped'
  });
  return null;
}
run.arrived += 1;
run.results.push(msg.payload);
var complete = run.linesSeen >= run.lines && run.arrived >= run.expected;
if (!complete) {
  flow.set('dayRuns', runs);
  return null;
}
delete runs[msg.runKey];
flow.set('dayRuns', runs);
delete msg.runKey;
msg.payload = run.results;
return msg;
