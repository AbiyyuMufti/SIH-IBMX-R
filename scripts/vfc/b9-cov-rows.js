// Builds the Volume_CoV_EU rows of one site and month (report queries Volume
// CoV H, N, W): plan OPT rows grouped per day, shift and machine. In:
// msg.payload = parsed plan OPT month file, flow context shiftMap. Out 1: the
// table message, out 2: a check log line.
var MIN_GOOD_PARTS = 1000;
// groupBy 'shift': Hull groups on the mapped shift; 'raw': the other sites
// group on the raw shift name and map it after (two raw names of one shift
// give two rows).
var RULES = {
  Hull: {
    groupBy: 'shift',
    skip: [
      'GT4 - Auto'
    ]
  },
  Nottingham: {
    groupBy: 'raw',
    skip: [
      'N11 Auto'
    ]
  },
  Weinheim: {
    groupBy: 'raw',
    skip: [
      'N11 Auto'
    ]
  }
};

var site = msg.site;
var rule = RULES[site] || RULES.Weinheim;
var rows = Array.isArray(msg.payload) ? msg.payload : [];
var shiftMap = flow.get('shiftMap') || {};
var groups = {};
var order = [];

// The csv node leaves empty cells out of the row: an empty text is ''.
function asText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function number(value) {
  var text = asText(value).trim();
  return text === '' || isNaN(Number(text)) ? null : Number(text);
}

function shiftOf(raw) {
  return shiftMap.hasOwnProperty(raw) ? shiftMap[raw] : null;
}

// Days since 1970-01-01 of a date text YYYY-MM-DD: the value of a DATE column.
function dayNumber(text) {
  return Date.UTC(
    Number(text.slice(0, 4)),
    Number(text.slice(5, 7)) - 1,
    Number(text.slice(8, 10))
  ) / 86400000;
}

// Text.Combine leaves a null part out: no shift gives the machine alone.
function joinParts(parts) {
  return parts.filter(function (part) {
    return part !== null && part !== '';
  }).join(' ');
}

rows.forEach(function (row) {
  var machine = asText(row.MachineName);
  if (machine === '' || rule.skip.indexOf(machine) !== -1) {
    return;
  }
  var date = asText(row['YYYY-MM-DD']);
  var shiftKey = rule.groupBy === 'shift' ?
    shiftOf(row.ShiftName) : asText(row.ShiftName);
  var key = date + '|' + shiftKey + '|' + machine;
  if (!groups[key]) {
    groups[key] = {
      date: date,
      shiftKey: shiftKey,
      machine: machine,
      goodParts: 0,
      capMax: null
    };
    order.push(key);
  }
  var group = groups[key];
  group.goodParts += number(row['Good Parts']) || 0;
  var capacity = number(row.Capacity);
  if (capacity !== null && (group.capMax === null || capacity > group.capMax)) {
    group.capMax = capacity;
  }
});

var out = [];
order.forEach(function (key) {
  var group = groups[key];
  if (!(group.goodParts > MIN_GOOD_PARTS)) {
    return;
  }
  var shift = rule.groupBy === 'shift' ?
    group.shiftKey : shiftOf(group.shiftKey);
  out.push({
    'Date': dayNumber(group.date),
    'Shift': shift,
    'MachineName': group.machine,
    'Good Parts Sum': group.goodParts,
    'Cap Max': group.capMax,
    'Shift Machine Key': joinParts([shift, group.machine]),
    'Unique Machine Name': group.machine + '-' + site,
    'SiteName': site,
    'loaded_at': msg.loadedAt
  });
});

var text = site + ' ' + msg.month + ': read ' + rows.length +
  ' plan rows, ' + order.length + ' day-shift-machine groups, kept ' +
  out.length + ' (Good Parts over ' + MIN_GOOD_PARTS + ')';
node.status({
  fill: out.length ? 'green' : 'yellow',
  shape: 'dot',
  text: site + ' ' + msg.month + ': ' + out.length + ' rows'
});
return [
  {
    table: 'Volume_CoV_EU',
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
