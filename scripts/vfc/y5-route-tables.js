// Sends the rows of the day to the four table lanes and the answer to the
// sender. In: msg.rows (y2 to y4), msg.day, msg.line, msg.notes. Out 1 to 4:
// the tables (nothing in dry run). Out 5: the answer (200). Out 6: plan,
// time and loss rows for EU_OEE_Fact (its tab decides on its own dry run).

// The tables of EU_OEE_Fact (Chartres has no Run Rate rows).
var FACT_TABLES = [
  'Plan_OPT_EU',
  'Time_Utilisation_EU',
  'Daily_Losses_EU'
];
var TABLES = [
  'Plan_OPT_EU',
  'Time_Utilisation_EU',
  'Daily_Losses_EU',
  'Volume_CoV_EU'
];
// Columns of each table (the schema of the parquet node): a column a row
// does not carry (filler rows) is written empty.
var COLUMNS = {};

var cfg = flow.get('cfg');
var out = [
  null,
  null,
  null,
  null,
  null,
  []
];
var counts = [];

TABLES.forEach(function (table, i) {
  var rows = msg.rows[table].map(function (row) {
    var full = {};
    COLUMNS[table].forEach(function (column) {
      full[column] = row[column] === undefined ? null : row[column];
    });
    return full;
  });
  counts.push(table + ' ' + rows.length);
  if (FACT_TABLES.indexOf(table) !== -1 && rows.length) {
    out[5].push({
      topic: 'fact',
      table: table,
      rows: rows,
      site: cfg.site,
      month: msg.day.iso + '_' + msg.day.machine,
      day: msg.day.iso,
      mode: 'excel',
      out: cfg.liveFolder,
      source: cfg.source,
      failed: [],
      skipped: [],
      itemCount: 1
    });
  }
  if (cfg.dryRun) {
    return;
  }
  out[i] = {
    payload: rows,
    table: table,
    iso: msg.day.iso,
    machine: msg.day.machine
  };
});

var mode = cfg.dryRun ? 'dry run, nothing written' : 'written';
msg.statusCode = 200;
msg.payload = {
  status: 'ok',
  detail: msg.day.machine + ' ' + msg.day.iso + ': ' + mode
};
msg.logLevel = (msg.notes || []).length ? 'warn' : 'info';
msg.logText = msg.day.machine + ' ' + msg.day.iso + ' (' + mode + '): ' +
  counts.join(', ');
if ((msg.notes || []).length) {
  msg.logText += '; notes: ' + msg.notes.join(' | ');
}
out[4] = msg;
return out;
