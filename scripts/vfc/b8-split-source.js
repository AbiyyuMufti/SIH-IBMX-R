// Splits the rows of one table month by the source of their line (1.1
// CONFIG: line reportSource, else site reportSource). In: msg.rows. Out: one
// message per folder (msg.out = report or candidate/<source>) with its rows.
var cfg = flow.get('cfg');
var site = cfg.sites.filter(function (entry) {
  return entry.name === msg.site;
})[0];

// MachineName of a Config line -> the source of that line.
var lineSource = {};
(site.lines || []).forEach(function (line) {
  lineSource[line.report] = line.reportSource || site.reportSource;
});

var live = [];
var candidate = [];
var moved = {};
msg.rows.forEach(function (row) {
  var source = lineSource[row.MachineName] || site.reportSource;
  if (source === cfg.source) {
    live.push(row);
    return;
  }
  candidate.push(row);
  moved[row.MachineName] = true;
});

function part(out, rows) {
  var copy = Object.assign({}, msg);
  copy.out = out;
  copy.rows = rows;
  copy.skipped = msg.skipped.slice();
  return copy;
}

var out = [];
if (live.length || !candidate.length) {
  out.push(part(cfg.liveFolder, live));
}
if (candidate.length) {
  var note = 'to ' + cfg.candidateFolder + ': ';
  note += Object.keys(moved).join(' / ');
  // shortcut: an old report file of the month is not deleted when all its
  // rows move to candidate; delete it by hand when a whole site switches.
  if (!live.length) {
    note += ' (no rows left for report/: its old file of the month stays)';
  }
  var moving = part(cfg.candidateFolder, candidate);
  moving.skipped.push(note);
  out.push(moving);
}
return [out];
