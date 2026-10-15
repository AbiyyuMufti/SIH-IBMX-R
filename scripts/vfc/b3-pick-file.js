// Picks the CSV file to read from the folder list.
// In: msg.payload = objects of the folder (list objects), msg.path = folder.
// Out 1: msg.path = the newest .csv file (for the read node). Out 2: a failed
// item for the table, when the folder has no .csv file.
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
msg.path = files[0].key;
node.status({
  fill: 'green',
  shape: 'dot',
  text: msg.site + ': ' + files.length + ' file(s)'
});
return [msg, null];
