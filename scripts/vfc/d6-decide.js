// Decides what happens with the day.
// In: msg.tables {table: [{out, rows}]} and msg.summary. Out 1: the message
// goes on to the table messages (write). Out 2: a log line (failed, nothing
// to write, dry run). Any failed asset means nothing is written for the day.
var cfg = flow.get('cfg');
var day = msg.day;
var summary = msg.summary;
var notes = summary.notes.join(' | ');
var counts = {};
var sizes = Object.keys(msg.tables).map(function (table) {
  var parts = msg.tables[table].map(function (group) {
    return group.rows.length + ' rows to ' + group.out;
  });
  counts[table] = msg.tables[table].reduce(function (sum, group) {
    return sum + group.rows.length;
  }, 0);
  return table + ' ' + (parts.length ? parts.join(', ') : '0 rows');
}).join(', ');
var empty = !counts.Plan_OPT_EU && !counts.Daily_Losses_EU;

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
    text: day + ' dry run ' + counts.Plan_OPT_EU + '/' +
      counts.Daily_Losses_EU
  });
  return logOnly(notes + ' | DRY RUN: ' + sizes + tail);
}

msg.writeNote = notes + ' | WRITING ' + sizes + tail;
return [msg, null];
