// Adds machine, source, EU scope and Format List columns to one table month.
// In: msg.rows of one site and month. Out: the rows with Dept, Area, Product
// Type (machines_<Site>), Data Source, In EU Report (scope_<Site>) and, for
// FORMAT_TABLES, Brand ... (formats_<Site>, key MachineName-Site PartName).
var DATA_SOURCE = 'Provideam';
var FORMAT_TABLES = [
  'Plan_OPT_EU',
  'Daily_Losses_EU',
  'Run_Rates_EU'
];
var FORMAT_COLUMNS = [
  'Brand',
  'Unit Size',
  'Unit Count/Format',
  'Extra Info'
];
var machines = flow.get('machines_' + msg.site) || {};
var formats = flow.get('formats_' + msg.site) || {};
var withFormat = FORMAT_TABLES.indexOf(msg.table) !== -1;
var noFormat = 0;
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
  if (withFormat) {
    // Trailing spaces of the machine go on both sides ('Bosch Capsulator ').
    var key = String(row.MachineName).replace(/\s+$/, '') + '-' + msg.site +
      ' ' + row.PartName;
    var format = formats[key];
    if (!format) {
      noFormat++;
    }
    FORMAT_COLUMNS.forEach(function (column) {
      row[column] = format ? format[column] : null;
    });
  }
});
if (noFormat) {
  msg.skipped.push('not in Format List: ' + noFormat + ' rows');
}
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
