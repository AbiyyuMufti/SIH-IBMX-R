// Builds one message per table for the parquet nodes.
// In: msg.planRows, msg.utilRows, msg.lossRows and msg.writeNote.
// Out 1: pbi_plan_opt. Out 2: pbi_time_utilisation. Out 3: pbi_daily_losses.
// Out 4: log line. A table without rows sends nothing.
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
  text: day + ' ' + msg.planRows.length + '/' + msg.lossRows.length
});
var line = {
  topic: 'log',
  payload: day + ' [' + msg.mode + '] ' + msg.writeNote
};
return [
  table('pbi_plan_opt', msg.planRows),
  table('pbi_time_utilisation', msg.utilRows),
  table('pbi_daily_losses', msg.lossRows),
  line
];
