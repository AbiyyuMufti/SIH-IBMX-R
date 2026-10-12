// Decides what happens with the day.
// In: msg.planRows, utilRows, lossRows and summary. Out 1: the message goes
// on to node 6.3 (write). Out 2: a log line (failed, nothing to write, dry
// run). Any failed asset means nothing is written for the day.
var cfg = flow.get('cfg');
var day = msg.day;
var summary = msg.summary;
var notes = summary.notes.join(' | ');
var sizes = 'pbi_plan_opt ' + msg.planRows.length + ' rows, ' +
  'pbi_time_utilisation ' + msg.utilRows.length + ' rows, ' +
  'pbi_daily_losses ' + msg.lossRows.length + ' rows';
var empty = !msg.planRows.length && !msg.lossRows.length;

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
if (empty) {
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
    text: day + ' dry run ' + msg.planRows.length + '/' + msg.lossRows.length
  });
  return logOnly(notes + ' | DRY RUN: ' + sizes + tail);
}

msg.writeNote = notes + ' | WRITING ' + sizes + tail;
return [msg, null];
