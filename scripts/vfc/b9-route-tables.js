// Sends a site on after its lookups are stored, to the tables of the job.
// In: the site message, msg.job.tables. Out 1: Run_Rates_EU months, out 2:
// Volume_CoV_EU months, out 3: Format_List_EU (one file per site).
var tables = msg.job.tables;

function wants(table) {
  return tables.indexOf(table) !== -1;
}

node.status({
  fill: 'green',
  shape: 'dot',
  text: msg.site + ': ' + tables.length + ' table(s)'
});
return [
  wants('Run_Rates_EU') ? msg : null,
  wants('Volume_CoV_EU') ? msg : null,
  wants('Format_List_EU') ? msg : null
];
