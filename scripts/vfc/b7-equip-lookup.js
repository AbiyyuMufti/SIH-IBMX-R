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
// Empty cells are left out of a row (the csv node), so the columns are looked
// for in any row, not in the first one.
var known = rows.some(function (row) {
  return row.MachineName !== undefined ||
    row['Merged Unique Identifier'] !== undefined;
});
if (!known) {
  msg.payload = {
    failed: 'equipment coding ' + msg.site + ': no MachineName column or rows'
  };
  return [null, msg];
}

function asText(value) {
  return value === undefined || value === null ? '' : String(value);
}

var lookup = {};
rows.forEach(function (row) {
  var merged = row['Merged Unique Identifier'];
  var key = merged !== undefined ? asText(merged) :
    asText(row.MachineName) + ' ' + asText(row.OEELossLvl3Desc);
  lookup[key] = lookup[key] || [];
  lookup[key].push(asText(row.Equipment) === '' ? 'Unclassed' : row.Equipment);
});
flow.set('equip_' + msg.site, lookup);
node.status({
  fill: 'green',
  shape: 'dot',
  text: msg.site + ': ' + Object.keys(lookup).length + ' equipment keys'
});
msg.payload = msg.site;
return [msg, null];
