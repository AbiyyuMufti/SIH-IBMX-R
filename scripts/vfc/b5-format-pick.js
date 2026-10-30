// Picks the newest .csv of the Format List folder (list objects).
// Out 1: msg.path for the read node. Out 2: a site without a Format List file
// (Nottingham has none): an empty lookup is stored and the setup goes on.
var TENANT_PREFIX = /^\/?(data\/ten=[^\/]+\/)?/;
var items = Array.isArray(msg.payload) ? msg.payload : [];
var files = items.filter(function (item) {
  return /\.csv$/i.test(item.key);
});

if (!files.length) {
  flow.set('formats_' + msg.site, {});
  node.status({
    fill: 'yellow',
    shape: 'ring',
    text: 'no format list for ' + msg.site
  });
  msg.payload = msg.site;
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
