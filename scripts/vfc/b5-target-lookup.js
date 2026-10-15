// Builds the target lookup of one site from its Glidepaths file.
// In: msg.payload = parsed rows (Site Name, Line, OEE Bucket, one column per
// month 01/MM/YYYY). Stores flow context targets_<site>: machine-site ->
// month text -> {oee, pdt, updt}. Out 2: a failed item when the file is empty.
var BUCKETS = {
  '% OEE': 'oee',
  'Planned Downtime (Total)': 'pdt',
  'Unplanned Downtime (Total)': 'updt'
};
// The file starts with a byte order mark: it sits in the first column name.
function clean(row) {
  var out = {};
  Object.keys(row).forEach(function (column) {
    out[column.replace(/\uFEFF/g, '')] = row[column];
  });
  return out;
}

var rows = Array.isArray(msg.payload) ? msg.payload.map(clean) : [];
if (!rows.length || rows[0].Line === undefined) {
  msg.payload = {
    failed: 'glidepaths ' + msg.site + ': no Line column or rows'
  };
  return [null, msg];
}

var lookup = {};
var cells = 0;
rows.forEach(function (row) {
  var field = BUCKETS[row['OEE Bucket']];
  if (!field) {
    return;
  }
  var key = row.Line + '-' + row['Site Name'];
  Object.keys(row).forEach(function (column) {
    var value = String(row[column]).trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(column) || value === '') {
      return;
    }
    var number = Number(value);
    if (isNaN(number)) {
      return;
    }
    lookup[key] = lookup[key] || {};
    lookup[key][column] = lookup[key][column] || {};
    lookup[key][column][field] = number;
    cells++;
  });
});
flow.set('targets_' + msg.site, lookup);
node.status({
  fill: 'green',
  shape: 'dot',
  text: msg.site + ': ' + cells + ' target values'
});
msg.payload = msg.site;
return [msg, null];
