// Builds the Run_Rates_EU rows of one site and month (report queries Run
// Rates H, N, W). In: msg.payload = parsed run rates month file (one row per
// machine and hour), flow context shiftMap. Out 1: the table message, out 2:
// a check log line.
var RULES = {
  Weinheim: {
    partCutChars: 8
  }
};
// Sites whose raw shift name holds the crew colour ("MonDay - Blue"): the
// Hull site report splits it into Shift Time and Shift Colour (empty: Pink).
var COLOUR_SITES = [
  'Hull'
];
var NO_COLOUR = 'Pink';

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

// Days since 1970-01-01 of "YYYY-MM-DD ..." (a DATE column value).
function dayNumber(text) {
  var parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!parts) {
    return null;
  }
  return Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])) /
    86400000;
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
  var raw = asText(row.ShiftName);
  var shiftTime = known ? shiftMap[row.ShiftName] : null;
  var colour = null;
  if (COLOUR_SITES.indexOf(site) !== -1) {
    var at = raw.indexOf('-');
    shiftTime = (at === -1 ? raw : raw.slice(0, at)).trim();
    colour = at === -1 ? '' : raw.slice(at + 1).trim();
    colour = colour === '' ? NO_COLOUR : colour;
  }
  var hourText = asText(row['YYYY-MM-DD HH']);
  out.push({
    'AreaName': asText(row.AreaName),
    'Capacity': number(row.Capacity),
    'Date': dayNumber(hourText),
    'Good Parts': goodParts,
    'MachineName': machine,
    'PartName': part,
    'Product Key': machine + ' ' + part,
    'Shift Colour': colour,
    'Shift Time': shiftTime,
    'ShiftName': raw,
    'Site': site,
    'Hour': hourMs(hourText),
    'Unique Machine Name': unique,
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
