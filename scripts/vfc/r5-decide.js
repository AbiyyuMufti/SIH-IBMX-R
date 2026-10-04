// Decides what happens with the table __TABLE__.
// In: msg.rows, msg.failed, msg.skipped. Out 1: msg.payload = rows for the
// parquet node. Out 2: a log line. A failed item means nothing is written.
var TABLE = '__TABLE__';
var cfg = flow.get('cfg');
var rows = msg.rows;
var tail = '';
if (msg.skipped.length) {
  tail += ' | skipped: ' + msg.skipped.join('; ');
}
var sizes = TABLE + ' ' + rows.length + ' rows from ' +
  msg.itemCount + ' item(s)';

function logOnly(text) {
  var line = {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] ' + text
  };
  return [null, line];
}

if (msg.failed.length) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'FAILED, nothing written'
  });
  return logOnly(
    'FAILED, NOTHING WRITTEN: ' + msg.failed.join(' | ') + tail
  );
}
if (!rows.length) {
  node.status({
    fill: 'grey',
    shape: 'ring',
    text: 'nothing to write'
  });
  return logOnly('NOTHING TO WRITE: ' + sizes + tail);
}
if (cfg.dryRun[TABLE]) {
  node.status({
    fill: 'yellow',
    shape: 'dot',
    text: 'dry run ' + rows.length
  });
  var firstRows = JSON.stringify(rows.slice(0, 2));
  return logOnly('DRY RUN: ' + sizes + '. First rows: ' + firstRows + tail);
}

node.status({
  fill: 'green',
  shape: 'dot',
  text: 'writing ' + rows.length
});
var writing = {
  topic: 'log',
  payload: msg.day + ' [' + msg.mode + '] WRITING ' + sizes + tail
};
msg.payload = rows;
delete msg.rows;
return [msg, writing];
