// Machine lookup of one site from its Machine Names file. In: msg.payload =
// parsed rows; stores flow context machines_<Site>: MachineName -> Dept,
// Area, Product Type. Out 2: a failed item. Report filters per site, skipped
// with msg.allMachines (SIH flow: its Config lines choose the machines).
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
var rule = msg.allMachines ? {} : RULES[site] || {};
var rows = Array.isArray(msg.payload) ? msg.payload : [];
if (!rows.length || rows[0].MachineName === undefined) {
  msg.payload = {
    failed: 'machine names ' + site + ': no MachineName column or rows'
  };
  return [null, msg];
}

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function allowed(list, value) {
  return !list || list.indexOf(value) !== -1;
}

// A machine left out by the rules has no entry: its rows get empty Dept,
// Area and Product Type, as in the report.
var lookup = {};
var kept = 0;
rows.forEach(function (row) {
  var name = text(row.MachineName);
  var dept = text(row.Dept);
  var area = text(row.Area);
  var drop = !name ||
    (rule.dropNames && rule.dropNames.indexOf(name) !== -1) ||
    !allowed(rule.keepDepts, dept) ||
    !allowed(rule.keepAreas, area);
  if (drop) {
    return;
  }
  lookup[name] = {
    'Dept': dept,
    'Area': area,
    'Product Type': text(row['Product Type'])
  };
  kept++;
});
flow.set('machines_' + site, lookup);
node.status({
  fill: 'green',
  shape: 'dot',
  text: site + ': ' + kept + ' machines'
});
msg.payload = site;
return [msg, null];
