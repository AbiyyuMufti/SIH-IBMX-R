// Builds the volume total lookup of one site and month (Targets Volume).
// In: msg.payload = parsed plan OPT month file. Stores flow context
// cap_<site>_<month>: "machine dd/MM/yyyy" -> sum of Capacity of that day.
// Machines left out as in the report: blank, GT4 - Auto (Hull), N11 Auto.
var SKIP = {
  Hull: ['GT4 - Auto'],
  Nottingham: ['N11 Auto'],
  Weinheim: ['N11 Auto']
};
var skip = SKIP[msg.site] || [];
var rows = Array.isArray(msg.payload) ? msg.payload : [];
var map = {};
var days = 0;

rows.forEach(function (row) {
  var machine = row.MachineName;
  var day = row['YYYY-MM-DD'];
  if (!machine || !day || skip.indexOf(machine) !== -1) {
    return;
  }
  var text = day.slice(8, 10) + '/' + day.slice(5, 7) + '/' + day.slice(0, 4);
  var key = machine + ' ' + text;
  var capacity = Number(String(row.Capacity).trim());
  if (map[key] === undefined) {
    map[key] = 0;
    days++;
  }
  map[key] += isNaN(capacity) ? 0 : capacity;
});
flow.set('cap_' + msg.site + '_' + msg.month, map);
node.status({
  fill: 'green',
  shape: 'dot',
  text: msg.site + ' ' + msg.month + ': ' + days + ' machine-days'
});
delete msg.payload;
return msg;
