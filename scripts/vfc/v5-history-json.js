// Parses one quoted CSV log file and returns its newest 200 rows as JSON.
// In: msg.payload = the CSV text from the data lake read-object node.
// Out: JSON rows, or an explicit 502 for an unusable file.
var MAX_ROWS = 200;

// The read node gives a Buffer (or a serialised one) in the VFC, or text.
function decode(payload) {
  if (typeof payload === 'string') {
    return payload;
  }
  if (Buffer.isBuffer(payload)) {
    return payload.toString('utf8');
  }
  if (payload && payload.type === 'Buffer' && payload.data) {
    return Buffer.from(payload.data).toString('utf8');
  }
  return null;
}

var text = decode(msg.payload);
if (text === null) {
  msg.statusCode = 502;
  msg.headers = {
    'content-type': 'application/json'
  };
  msg.payload = {
    error: 'the data lake did not return log text'
  };
  return msg;
}

var rows = [];
var row = [];
var field = '';
var quoted = false;
for (var i = 0; i < text.length; i++) {
  var ch = text.charAt(i);
  if (ch === '"') {
    if (quoted && text.charAt(i + 1) === '"') {
      field += '"';
      i++;
    } else {
      quoted = !quoted;
    }
  } else if (ch === ',' && !quoted) {
    row.push(field);
    field = '';
  } else if (ch === '\n' && !quoted) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
    row = [];
    field = '';
  } else {
    field += ch;
  }
}
if (field || row.length) {
  row.push(field.replace(/\r$/, ''));
  rows.push(row);
}

var headers = rows.shift() || [];
if (headers.indexOf('ts_utc') === -1 ||
    headers.indexOf('message') === -1) {
  msg.statusCode = 502;
  msg.headers = {
    'content-type': 'application/json'
  };
  msg.payload = {
    error: 'the history file has an unexpected header'
  };
  return msg;
}

var entries = rows.filter(function (values) {
  return values.some(function (value) {
    return value !== '';
  });
}).map(function (values) {
  var entry = {};
  headers.forEach(function (header, index) {
    entry[header] = values[index] || '';
  });
  return entry;
});
var total = entries.length;
var recent = entries.slice(-MAX_ROWS);

msg.statusCode = 200;
msg.headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};
msg.payload = {
  flow: msg.historyFlow,
  month: msg.historyMonth,
  count: total,
  truncated: total - recent.length,
  rows: recent
};
return msg;
