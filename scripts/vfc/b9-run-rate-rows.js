// Builds the Run_Rates_EU rows of one site and month (report queries Run
// Rates H, N, W). In: msg.payload = parsed run rates month file (one row per
// machine and hour), flow context shiftMap. Out 1: the table message, out 2:
// a check log line.
var RULES = {
  Weinheim: {
    partCutChars: 8
  }
};

var site = msg.site;
var rule = RULES[site] || {};
var rows = Array.isArray(msg.payload) ? msg.payload : [];
var shiftMap = flow.get('shiftMap') || {};
var out = [];
var count = {
  noMachine: 0,
  zeroParts: 0,
  noShift: {}
};

// The csv node leaves empty cells out of the row: an empty text is ''.
function asText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function number(value) {
  var text = asText(value).trim();
  return text === '' || isNaN(Number(text)) ? null : Number(text);
}

// "YYYY-MM-DD HH:MM:SS" -> ms of that wall clock time written as UTC.
function hourMs(text) {
  var parts = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})/.exec(text);
  if (!parts) {
    return null;
  }
  return Date.UTC(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
    Number(parts[4])
  );
}

rows.forEach(function (row) {
  var machine = asText(row.MachineName);
  if (machine === '') {
    count.noMachine++;
    return;
  }
  var goodParts = number(row['Good Parts']);
  if (goodParts === 0) {
    count.zeroParts++;
    return;
  }
  var part = asText(row.PartName);
  if (rule.partCutChars) {
    part = part.slice(rule.partCutChars);
  }
  // Trailing spaces go: the report data has none (leading spaces stay).
  part = part.replace(/\s+$/, '');
  var known = shiftMap.hasOwnProperty(row.ShiftName);
  if (!known) {
    count.noShift[row.ShiftName] = true;
  }
  var unique = machine + '-' + site;
  out.push({
    'Date': hourMs(asText(row['YYYY-MM-DD HH'])),
    'AreaName': asText(row.AreaName),
    'MachineName': machine,
    'PartName': part,
    'ShiftName': known ? shiftMap[row.ShiftName] : null,
    'Good Parts': goodParts,
    'Capacity': number(row.Capacity),
    'SiteName': site,
    'Unique Machine Name': unique,
    'Product Key': unique + ' ' + part,
    'Good Parts - Copy': goodParts,
    'loaded_at': msg.loadedAt
  });
});

var text = site + ' ' + msg.month + ': read ' + rows.length +
  ' run rate rows, kept ' + out.length + ' (no machine ' + count.noMachine +
  ', Good Parts 0: ' + count.zeroParts + ')';
var noShift = Object.keys(count.noShift);
if (noShift.length) {
  text += ', shift not mapped: ' + noShift.slice(0, 5).join(' / ');
}
node.status({
  fill: out.length ? 'green' : 'yellow',
  shape: 'dot',
  text: site + ' ' + msg.month + ': ' + out.length + ' rows'
});
return [
  {
    table: 'Run_Rates_EU',
    rows: out,
    failed: [],
    skipped: [],
    itemCount: 1,
    site: site,
    month: msg.month,
    day: msg.day,
    mode: msg.mode,
    loadedAt: msg.loadedAt,
    job: msg.job
  },
  {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] CHECK ' + text
  }
];
