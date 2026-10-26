// Machine lookup of one site from its Machine Names file. In: msg.payload =
// parsed rows; stores flow context machines_<Site>: MachineName -> Dept,
// Area, Product Type, for every machine of the file (the EU scope is the
// column In EU Report, from the report scope file). Out 2: a failed item.
var site = msg.site;
var rows = Array.isArray(msg.payload) ? msg.payload : [];
if (!rows.length || rows[0].MachineName === undefined) {
  msg.payload = {
    failed: 'machine names ' + site + ': no MachineName column or rows'
  };
  return [null, msg];
}

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

var lookup = {};
var kept = 0;
rows.forEach(function (row) {
  var name = text(row.MachineName);
  if (!name) {
    return;
  }
  lookup[name] = {
    'Dept': text(row.Dept),
    'Area': text(row.Area),
    'Product Type': text(row['Product Type'])
  };
  kept++;
});
flow.set('machines_' + site, lookup);
node.status({
  fill: 'green',
  shape: 'dot',
  text: site + ': ' + kept + ' machines'
});
msg.payload = site;
return [msg, null];
