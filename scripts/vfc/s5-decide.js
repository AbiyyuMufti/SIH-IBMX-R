// Decides what happens with the day.
// In: msg.kpiRows, msg.lossRows and msg.summary. Out 1: the message goes on
// to node 5.4 (write). Out 2: a log line (failed, nothing to write, dry run).
// Any failed asset means nothing is written for the day (no half days).
var cfg = flow.get('cfg');
var day = msg.day;
var summary = msg.summary;
var kpiRows = msg.kpiRows;
var lossRows = msg.lossRows;
var notes = summary.notes.join(' | ');
var counts = kpiRows.length + '/' + lossRows.length;
var sizes = 'fact_kpi ' + kpiRows.length + ' rows, ' +
  'fact_loss ' + lossRows.length + ' rows';

// Text added to the end of every log line.
var tail = '';
if (summary.skipped.length) {
  tail += ' | skipped: ' + summary.skipped.join('; ');
}
if (summary.unmapped.length) {
  tail += ' | KPI without column: ' + summary.unmapped.join(', ');
}

function logOnly(text) {
  var line = { topic: 'log', payload: day + ' [' + msg.mode + '] ' + text };
  return [null, line];
}

if (summary.failed.length) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: day + ' FAILED, nothing written'
  });
  return logOnly(
    'FAILED, NOTHING WRITTEN: ' + summary.failed.join(' | ') + tail
  );
}
if (!kpiRows.length && !lossRows.length) {
  node.status({
    fill: 'grey',
    shape: 'ring',
    text: day + ' nothing to write'
  });
  return logOnly(notes + ' | NOTHING TO WRITE' + tail);
}
if (cfg.dryRun) {
  node.status({
    fill: 'yellow',
    shape: 'dot',
    text: day + ' dry run ' + counts
  });
  var firstRows = JSON.stringify({
    fact_kpi: kpiRows.slice(0, 2),
    fact_loss: lossRows.slice(0, 2)
  });
  return logOnly(
    notes + ' | DRY RUN: ' + sizes + '. First rows: ' + firstRows + tail
  );
}

msg.writeNote = notes + ' | WRITING ' + sizes + tail;
return [msg, null];
