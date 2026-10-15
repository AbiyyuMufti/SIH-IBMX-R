// Picks the newest .csv of the folder list (list objects).
// Out 1: msg.path for the read node, without data/ten=<tenant>/ or a leading
// slash. Out 2: a failed item when the folder has no .csv.
var TENANT_PREFIX = /^\/?(data\/ten=[^\/]+\/)?/;
var items = Array.isArray(msg.payload) ? msg.payload : [];
var files = items.filter(function (item) {
  return /\.csv$/i.test(item.key);
});

if (!files.length) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'no csv file for ' + msg.site
  });
  msg.payload = {
    name: msg.site,
    failed: msg.what + ' ' + msg.site + ': no csv file in ' + msg.path,
    skipped: null,
    rows: []
  };
  return [null, msg];
}

files.sort(function (a, b) {
  return String(b.lastModified).localeCompare(String(a.lastModified));
});
msg.path = String(files[0].key).replace(TENANT_PREFIX, '');
node.status({
  fill: 'green',
  shape: 'dot',
  text: msg.path.slice(-40)
});
return [msg, null];
