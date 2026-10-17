// Builds the machine rows of one site from its Machine Names file.
// In: msg.payload = the parsed rows (MachineName, Dept, Area, Product Type).
// Out: msg.payload = an item {name, failed, skipped, rows} for the join.
// The rules are those of the load queries of the report (Machine Names H, N).
var RULES = {
  Hull: {
    dropNames: [
      'GT4 - Auto'
    ],
    keepDepts: [
      'Dries Pack',
      'Liquids Pack'
    ]
  },
  Nottingham: {
    keepAreas: [
      'SD Packing',
      'Strepsils Packing'
    ]
  },
  Weinheim: {},
  Mira: {}
};

var site = msg.site;
var rule = RULES[site] || {};
var item = {
  name: site,
  failed: null,
  skipped: null,
  rows: []
};
var rows = Array.isArray(msg.payload) ? msg.payload : [];
if (!rows.length || rows[0].MachineName === undefined) {
  item.failed = 'machine names ' + site + ': no MachineName column or rows';
  msg.payload = item;
  return msg;
}

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function allowed(list, value) {
  return !list || list.indexOf(value) !== -1;
}

var dropped = 0;
rows.forEach(function (row) {
  var name = text(row.MachineName);
  var dept = text(row.Dept);
  var area = text(row.Area);
  var drop = !name ||
    (rule.dropNames && rule.dropNames.indexOf(name) !== -1) ||
    !allowed(rule.keepDepts, dept) ||
    !allowed(rule.keepAreas, area);
  if (drop) {
    dropped++;
    return;
  }
  item.rows.push({
    'MachineName': name,
    'Dept': dept,
    'Area': area,
    'Product Type': text(row['Product Type']),
    'SiteName': site,
    'Unique Machine Name': name + '-' + site,
    'loaded_at': msg.loadedAt
  });
});
if (dropped) {
  item.skipped = site + ': ' + dropped + ' row(s) left out by the report rules';
}
msg.payload = item;
return msg;
