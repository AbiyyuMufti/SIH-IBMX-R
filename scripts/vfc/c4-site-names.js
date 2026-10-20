// Takes the MachineName values of one site's Machine Names file.
// In: msg.payload = the parsed rows (MachineName, Dept, ...). Out:
// msg.payload = an item {name, failed, names} for the join.
var rows = Array.isArray(msg.payload) ? msg.payload : [];
var item = {
  name: msg.site,
  failed: null,
  names: []
};

if (!rows.length || rows[0].MachineName === undefined) {
  item.failed = 'machine names ' + msg.site + ': no MachineName column';
}
rows.forEach(function (row) {
  var name = String(row.MachineName || '').trim();
  if (name && item.names.indexOf(name) === -1) {
    item.names.push(name);
  }
});
msg.payload = item;
return msg;
