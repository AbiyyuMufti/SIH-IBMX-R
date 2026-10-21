// Builds one message per table and output folder for the parquet nodes.
// In: msg.tables {table: [{out, rows}]} and msg.writeNote. Out 1:
// Plan_OPT_EU, out 2: Time_Utilisation_EU, out 3: Daily_Losses_EU (each a
// list, one message per folder), out 4: log line. No rows: no message.
var day = msg.day;

function table(name) {
  return msg.tables[name].filter(function (group) {
    return group.rows.length > 0;
  }).map(function (group) {
    return {
      topic: name,
      day: day,
      out: group.out,
      payload: group.rows
    };
  });
}

node.status({
  fill: 'green',
  shape: 'dot',
  text: day + ' written'
});
var line = {
  topic: 'log',
  payload: day + ' [' + msg.mode + '] ' + msg.writeNote
};
return [
  table('Plan_OPT_EU'),
  table('Time_Utilisation_EU'),
  table('Daily_Losses_EU'),
  line
];
