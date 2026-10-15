// Builds the equipment lookup of one site from its Equipment Coding file.
// In: msg.payload = parsed rows. Stores flow context equip_<site>: key
// "machine description" -> list of equipment (empty = "Unclassed"). Out 2: a
// failed item for an empty file.
var rows = Array.isArray(msg.payload) ? msg.payload : [];
var BOM = /\uFEFF/g;
rows = rows.map(function (row) {
  var out = {};
  Object.keys(row).forEach(function (column) {
    out[column.replace(BOM, '')] = row[column];
  });
  return out;
});
if (!rows.length || rows[0].Equipment === undefined) {
  msg.payload = {
    failed: 'equipment coding ' + msg.site + ': no Equipment column or rows'
  };
  return [null, msg];
}

var lookup = {};
rows.forEach(function (row) {
  var merged = row['Merged Unique Identifier'];
  var key = merged !== undefined ? merged :
    row.MachineName + ' ' + row.OEELossLvl3Desc;
  lookup[key] = lookup[key] || [];
  lookup[key].push(row.Equipment === '' ? 'Unclassed' : row.Equipment);
});
flow.set('equip_' + msg.site, lookup);
node.status({
  fill: 'green',
  shape: 'dot',
  text: msg.site + ': ' + Object.keys(lookup).length + ' equipment keys'
});
msg.payload = msg.site;
return [msg, null];
