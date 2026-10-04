// Adds the rows of one batch to the log file of the month.
// In: msg.payload = the old file (read answered) or nothing (no answer).
// Out: msg.payload = the whole new file, the data lake has no append.
// The same batch can arrive twice (read answer, then the wait): once only.
var SEPARATOR = ',';
var KEEP_IDS = 50;
var COLUMNS = [
  'ts_utc',
  'seq',
  'flow',
  'site',
  'production_day',
  'mode',
  'level',
  'source',
  'message'
];

// Quotes inside a field are doubled, line breaks become a space.
function quote(value) {
  var text = (value === undefined || value === null) ? '' : String(value);
  text = text.replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
  return '"' + text + '"';
}

function lineOf(row) {
  return COLUMNS.map(function (name) {
    return quote(row[name]);
  }).join(SEPARATOR);
}

// The read node gives text, or a serialised buffer.
function decode(payload) {
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload && payload.type === 'Buffer' && payload.data) {
    var bin = '';
    payload.data.forEach(function (byte) {
      bin += String.fromCharCode(byte);
    });
    try {
      return decodeURIComponent(escape(bin));
    } catch (e) {
      return bin;
    }
  }
  return null;
}

var rows = msg.logRows.slice();
rows.sort(function (a, b) {
  if (a.ts_utc !== b.ts_utc) {
    return a.ts_utc < b.ts_utc ? -1 : 1;
  }
  return a.seq - b.seq;
});

var done = flow.get('logDone') || [];
var known = flow.get('logKnown') || [];
if (done.indexOf(msg.logBatchId) >= 0) {
  return null;
}

var path = msg.path;
var old = '';
var problem = '';
if (msg.payload === undefined || msg.payload === null) {
  if (known.indexOf(path) >= 0) {
    problem = 'read gave no answer for a file written before';
  }
} else {
  old = decode(msg.payload);
  if (old === null) {
    old = '';
    problem = 'old file is not text';
  }
}
if (problem) {
  // Never replace the old file: write a new one with a time stamp.
  var stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  path = path.replace(/\.csv$/, '_' + stamp + '.csv');
  rows.push({
    ts_utc: new Date().toISOString(),
    seq: 0,
    flow: rows[0].flow,
    site: rows[0].site,
    production_day: '',
    mode: '',
    level: 'error',
    source: 'log',
    message: problem + ', wrote ' + path
  });
} else if (known.indexOf(path) < 0) {
  known.push(path);
  flow.set('logKnown', known);
}

var lines = [];
if (!old) {
  lines.push(COLUMNS.map(quote).join(SEPARATOR));
} else if (old.slice(-1) !== '\n') {
  old += '\n';
}
rows.forEach(function (row) {
  lines.push(lineOf(row));
});

done.push(msg.logBatchId);
flow.set('logDone', done.slice(-KEEP_IDS));

msg.payload = old + lines.join('\n') + '\n';
msg.path = path;
delete msg.logRows;
return msg;
