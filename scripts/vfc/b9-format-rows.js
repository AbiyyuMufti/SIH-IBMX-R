// Builds the Format_List_EU rows of one site (report query Format List EU).
// In: msg.payload = parsed Format List file of the site. Out 1: the table
// message (one file per site, no month), out 2: a check log line.
var COLUMNS = [
  'MachineName',
  'Product Name',
  'Brand',
  'Unit Size',
  'Unit Count/Format',
  'Extra Info'
];

var site = msg.site;
var rows = Array.isArray(msg.payload) ? msg.payload : [];

// The csv node leaves empty cells out of the row. As in the report: an
// empty cell is an empty text and trailing spaces go (leading ones stay).
function cell(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).replace(/\s+$/, '');
}

// A byte order mark can sit in the first column name.
function siteOf(row) {
  var value = row['Site Name'];
  return value !== undefined ? value : row['\uFEFFSite Name'];
}

var out = [];
var otherSite = 0;
rows.forEach(function (row) {
  var machine = cell(row.MachineName);
  if (machine === '') {
    return;
  }
  var siteName = cell(siteOf(row)) || site;
  if (siteName !== site) {
    otherSite++;
  }
  var item = {
    'Site Name': siteName
  };
  COLUMNS.forEach(function (column) {
    item[column] = cell(row[column]);
  });
  var unique = machine + '-' + siteName;
  item['Unique Machine Name'] = unique;
  item['Product Key'] = unique + ' ' + item['Product Name'];
  item['loaded_at'] = msg.loadedAt;
  out.push(item);
});

var text = site + ': read ' + rows.length + ' format rows, kept ' +
  out.length;
if (otherSite) {
  text += ', ' + otherSite + ' row(s) name another site in Site Name';
}
node.status({
  fill: out.length ? 'green' : 'yellow',
  shape: 'dot',
  text: site + ': ' + out.length + ' formats'
});
return [
  {
    table: 'Format_List_EU',
    rows: out,
    failed: [],
    skipped: [],
    itemCount: 1,
    site: site,
    day: msg.day,
    mode: msg.mode,
    loadedAt: msg.loadedAt,
    job: msg.job
  },
  {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] CHECK ' + text
  }
];
