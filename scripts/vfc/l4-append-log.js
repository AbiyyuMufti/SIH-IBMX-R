// Appends the rows of one batch to the log file of the month.
// In: the old file as msg.payload, or msg.logReadError if the read failed.
// Out: msg.payload = the whole new file (the data lake has no append).
var SEPARATOR = ',';
var NOT_FOUND = /not.?found|no such|does not exist|404/i;
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
  return '';
}

var rows = msg.logRows.slice();
rows.sort(function (a, b) {
  if (a.ts_utc !== b.ts_utc) {
    return a.ts_utc < b.ts_utc ? -1 : 1;
  }
  return a.seq - b.seq;
});

var path = msg.path;
var old = '';
if (msg.logReadError) {
  if (!NOT_FOUND.test(msg.logReadError)) {
    // Unclear read error: never replace the old file, start a new one.
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
      message: 'log read failed (' + msg.logReadError + '), wrote ' + path
    });
  }
} else {
  old = decode(msg.payload);
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

msg.payload = old + lines.join('\n') + '\n';
msg.path = path;
msg.logStep = 'write';
delete msg.logReadError;
delete msg.logRows;
return msg;
