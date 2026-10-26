// Picks the newest .csv of the report scope folder (list objects answer).
// Out 1: msg.path for the read node. Out 2: no file: the view is still
// answered, with msg.scopeMissing set (a read of a missing file would wait).
var TENANT_PREFIX = /^\/?(data\/ten=[^\/]+\/)?/;
var items = Array.isArray(msg.payload) ? msg.payload : [];
var files = items.filter(function (item) {
  return /\.csv$/i.test(String(item.key || ''));
});

if (!files.length) {
  msg.scopeMissing = 'no .csv file in ' + msg.scopeFolder;
  msg.payload = [];
  return [null, msg];
}
files.sort(function (a, b) {
  return String(b.lastModified).localeCompare(String(a.lastModified));
});
msg.scopeFile = {
  path: String(files[0].key).replace(TENANT_PREFIX, ''),
  lastModified: files[0].lastModified || ''
};
msg.path = msg.scopeFile.path;
return [msg, null];
