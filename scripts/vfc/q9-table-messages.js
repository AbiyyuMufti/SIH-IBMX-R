// Builds one message per table for the parquet nodes.
// In: msg.windowRows, msg.hourRows, msg.eventRows and msg.writeNote.
// Out 1: rpt_window. Out 2: rpt_hour. Out 3: rpt_event. Out 4: log line.
// A table without rows sends nothing.
var day = msg.day;

function table(name, rows) {
  if (!rows.length) {
    return null;
  }
  return { topic: name, day: day, payload: rows };
}

node.status({
  fill: 'green',
  shape: 'dot',
  text: day + ' ' + msg.hourRows.length + '/' + msg.eventRows.length
});
var line = {
  topic: 'log',
  payload: day + ' [' + msg.mode + '] ' + msg.writeNote
};
return [
  table('rpt_window', msg.windowRows),
  table('rpt_hour', msg.hourRows),
  table('rpt_event', msg.eventRows),
  line
];
