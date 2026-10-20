// Adds the machine columns and the source to the rows of one table month.
// In: msg.rows of one site and month. Out: the same rows with Dept, Area,
// Product Type (flow context machines_<Site>) and Data Source.
var DATA_SOURCE = 'Provideam';
var machines = flow.get('machines_' + msg.site) || {};

var unknown = {};
msg.rows.forEach(function (row) {
  var machine = machines[row.MachineName];
  if (!machine) {
    unknown[row.MachineName] = true;
  }
  row['Dept'] = machine ? machine['Dept'] : null;
  row['Area'] = machine ? machine['Area'] : null;
  row['Product Type'] = machine ? machine['Product Type'] : null;
  row['Data Source'] = DATA_SOURCE;
});
var missing = Object.keys(unknown);
if (missing.length) {
  var text = 'not in Machine Names (no Dept, Area, Product Type): ';
  text += missing.slice(0, 5).join(' / ');
  msg.skipped.push(text);
}
return msg;
