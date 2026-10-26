// Adds the machine columns, the source and the EU scope to the rows of one
// table month. In: msg.rows of one site and month. Out: the same rows with
// Dept, Area, Product Type (flow context machines_<Site>), Data Source and
// In EU Report (flow context scope_<Site>, rules of msg.table).
var DATA_SOURCE = 'Provideam';
var machines = flow.get('machines_' + msg.site) || {};
var scope = (flow.get('scope_' + msg.site) || {})[msg.table] || {
  keep: {},
  drop: {}
};

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

// In the EU report: every keep column holds one of its values, no drop
// column matches. A table without rules is fully in the EU report.
function inEuReport(row) {
  var kept = Object.keys(scope.keep).every(function (column) {
    return scope.keep[column].indexOf(text(row[column])) !== -1;
  });
  var dropped = Object.keys(scope.drop).some(function (column) {
    return scope.drop[column].indexOf(text(row[column])) !== -1;
  });
  return kept && !dropped;
}

var unknown = {};
var outside = 0;
msg.rows.forEach(function (row) {
  var machine = machines[row.MachineName];
  if (!machine) {
    unknown[row.MachineName] = true;
  }
  row['Dept'] = machine ? machine['Dept'] : null;
  row['Area'] = machine ? machine['Area'] : null;
  row['Product Type'] = machine ? machine['Product Type'] : null;
  row['Data Source'] = DATA_SOURCE;
  row['In EU Report'] = inEuReport(row);
  if (!row['In EU Report']) {
    outside++;
  }
});
var missing = Object.keys(unknown);
if (missing.length) {
  var note = 'not in Machine Names (no Dept, Area, Product Type): ';
  note += missing.slice(0, 5).join(' / ');
  msg.skipped.push(note);
}
if (outside) {
  msg.skipped.push('In EU Report false: ' + outside + ' rows');
}
return msg;
