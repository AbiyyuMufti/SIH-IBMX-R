// Builds the EU report scope of one site from the report scope file.
// In: msg.payload = parsed rows (Site, Tables, Rule, Column, Value). Stores
// flow context scope_<Site>: table -> {keep: {column: [values]}, drop: ...}.
// Out 2: a failed item when the file has no rows or columns.
var RULES = [
  'keep',
  'drop'
];

var rows = Array.isArray(msg.payload) ? msg.payload : [];
var site = msg.site;

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

// A byte order mark can sit in the first column name.
function siteOf(row) {
  return text(row.Site !== undefined ? row.Site : row['﻿Site']);
}

var ok = rows.some(function (row) {
  return row.Tables !== undefined && row.Rule !== undefined;
});
if (!ok) {
  msg.payload = {
    failed: 'report scope: no Tables / Rule columns or rows'
  };
  return [null, msg];
}

var scope = {};
var ruleCount = 0;
rows.forEach(function (row) {
  var rule = text(row.Rule).toLowerCase();
  var column = text(row.Column);
  var value = text(row.Value);
  if (siteOf(row) !== site || RULES.indexOf(rule) === -1 || !column) {
    return;
  }
  text(row.Tables).split(';').forEach(function (name) {
    var table = text(name);
    if (!table) {
      return;
    }
    scope[table] = scope[table] || {
      keep: {},
      drop: {}
    };
    var list = scope[table][rule];
    list[column] = list[column] || [];
    list[column].push(value);
    ruleCount++;
  });
});
flow.set('scope_' + site, scope);
node.status({
  fill: 'green',
  shape: 'dot',
  text: site + ': ' + ruleCount + ' scope rules'
});
msg.payload = site;
return [msg, null];
