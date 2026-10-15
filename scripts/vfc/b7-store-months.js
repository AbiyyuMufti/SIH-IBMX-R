// Stores which month files exist in the listed folder (flow context
// have_<type>_<site>: list of YYYY-MM), so a missing file is never read.
// In: msg.payload = objects of the folder, msg.filePrefix. Out: the site again.
var items = Array.isArray(msg.payload) ? msg.payload : [];
var months = [];
items.forEach(function (item) {
  var found = /_(\d{4}-\d{2})\.csv$/.exec(String(item.key));
  if (found && String(item.key).indexOf('/' + msg.filePrefix + '_') !== -1) {
    months.push(found[1]);
  }
});
flow.set('have_' + msg.filePrefix + '_' + msg.site, months);
node.status({
  fill: 'green',
  shape: 'dot',
  text: msg.filePrefix + ': ' + months.length + ' month file(s)'
});
msg.payload = msg.site;
return msg;
