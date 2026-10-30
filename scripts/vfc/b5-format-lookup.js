// Format lookup of one site from its Format List file. In: msg.payload =
// parsed rows; stores flow context formats_<Site>: Product Key (MachineName-
// Site + space + Product Name) -> Brand, Unit Size, Unit Count/Format,
// Extra Info. Out: msg.payload = the site, for the next setup lane.
var COLUMNS = [
  'Brand',
  'Unit Size',
  'Unit Count/Format',
  'Extra Info'
];
var site = msg.site;
var rows = Array.isArray(msg.payload) ? msg.payload : [];

// As in the report: trailing spaces go, an empty cell is empty (null).
function cell(value) {
  if (value === undefined || value === null) {
    return null;
  }
  var text = String(value).replace(/\s+$/, '');
  return text === '' ? null : text;
}

var lookup = {};
var kept = 0;
rows.forEach(function (row) {
  var machine = cell(row.MachineName);
  var product = cell(row['Product Name']);
  if (!machine || !product) {
    return;
  }
  var item = {};
  COLUMNS.forEach(function (column) {
    item[column] = cell(row[column]);
  });
  lookup[machine + '-' + site + ' ' + product] = item;
  kept++;
});
flow.set('formats_' + site, lookup);
node.status({
  fill: 'green',
  shape: 'dot',
  text: site + ': ' + kept + ' formats'
});
msg.payload = site;
return msg;
