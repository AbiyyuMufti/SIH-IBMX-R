// Maps the rows of one table message to the 65 columns of EU_OEE_Fact.
// In: msg.rows and msg.table (Plan_OPT_EU, Time_Utilisation_EU,
// Daily_Losses_EU or Run Rate), msg.payload = the parsed line list.
// Out 1: msg.rows = fact rows, msg.fileTag. Out 2: a check log line.

// Union, never a join (docs/eu-oee-fact-run-rate.md).
var RECORD_TYPE = {
  'Plan_OPT_EU': 'Plan',
  'Time_Utilisation_EU': 'Time Utilisation',
  'Daily_Losses_EU': 'Loss',
  'Run Rate': 'Run Rate'
};
// The part of the file name per record type.
var FILE_TAG = {
  'Plan': 'plan',
  'Time Utilisation': 'tu',
  'Loss': 'loss',
  'Run Rate': 'rr'
};
// Daily_Losses_EU names -> fact names.
var LOSS_RENAMES = {
  'Date': 'Event Date',
  'ShiftStartDate': 'Date',
  'Shift colour': 'Shift Colour',
  'target': 'Loss Target'
};
// Loss Target is a fraction (glidepath / 100): 6 decimals, as the month
// files (0.072, not 0.07200000000000001).
var ROUND_6 = [
  'Loss Target'
];
var COLUMNS = [
__COLUMNS__
];

var type = RECORD_TYPE[msg.table];
if (!type) {
  node.error('EU_OEE_Fact: unknown table ' + msg.table);
  return null;
}

// Line list: Unique Machine Name -> Dept, Area, Product Type.
function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}
var lines = {};
(Array.isArray(msg.payload) ? msg.payload : []).forEach(function (row) {
  var key = text(row['Unique Machine Name']);
  if (key) {
    lines[key] = row;
  }
});
var lineCount = Object.keys(lines).length;
if (!lineCount) {
  msg.failed = (msg.failed || []).concat(['line list empty or missing']);
}

// Line list value, else the value of the row (an empty cell is null).
function pick(line, row, column) {
  var value = line ? text(line[column]) : '';
  if (value !== '') {
    return value;
  }
  return row[column] === undefined ? null : row[column];
}

var unknown = {};
var listed = 0;
var out = msg.rows.map(function (source) {
  var row = {};
  Object.keys(source).forEach(function (name) {
    var to = type === 'Loss' && LOSS_RENAMES[name] ? LOSS_RENAMES[name] : name;
    if (COLUMNS.indexOf(to) === -1) {
      unknown[name] = true;
      return;
    }
    row[to] = source[name];
  });
  var fact = {};
  COLUMNS.forEach(function (column) {
    fact[column] = row[column] === undefined ? null : row[column];
  });
  ROUND_6.forEach(function (column) {
    if (typeof fact[column] === 'number') {
      fact[column] = Math.round(fact[column] * 1e6) / 1e6;
    }
  });
  var line = lines[text(source['Unique Machine Name'])];
  fact['Record Type'] = type;
  fact['In EU Report Source'] = row['In EU Report'] === undefined ?
    null : row['In EU Report'];
  fact['In EU Report'] = Boolean(line);
  fact['Dept'] = pick(line, row, 'Dept');
  fact['Area'] = pick(line, row, 'Area');
  fact['Product Type'] = pick(line, row, 'Product Type');
  if (line) {
    listed++;
  }
  return fact;
});

msg.rows = out;
msg.recordType = type;
msg.fileTag = FILE_TAG[type];
var check = msg.site + ' ' + msg.month + ' ' + type + ': ' + out.length;
check += ' fact rows, ' + listed + ' on the line list (' + lineCount;
check += ' lines)';
var extra = Object.keys(unknown);
if (extra.length) {
  check += ', columns not in EU_OEE_Fact left out: ' + extra.join(' / ');
}
node.status({
  fill: extra.length ? 'yellow' : 'green',
  shape: 'dot',
  text: msg.site + ' ' + msg.month + ' ' + type + ': ' + out.length
});
return [
  msg,
  {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] CHECK ' + check
  }
];
