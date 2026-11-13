// Run_Rates_EU rows of one site and day (machine and hour) -> the Run Rate
// rows of EU_OEE_Fact: totals per shift start day, line, shift, colour, part.
// In: msg.rows, flow context shiftMap, formats_<Site>. Out: msg.rows = fact
// rows (docs/eu-oee-fact-run-rate.md, port of run_rate_rows()).

// Part text fixes of the Plan rows (b6-plan-rows.js), so Product Keys match.
var PART_FIX = {
  Hull: [
    ['Gavi 12 X 150 Russian Crypto', 'Gavi 12 x 150 russian Crypto']
  ]
};
var DAYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun'
];
var FORMAT_COLUMNS = [
  'Brand',
  'Unit Size',
  'Unit Count/Format',
  'Extra Info'
];
var DAY_MS = 86400000;

var site = msg.site;
var shiftMap = flow.get('shiftMap') || {};
var formats = flow.get('formats_' + site) || {};

function fixPart(text) {
  var out = text === undefined || text === null ? '' : String(text);
  (PART_FIX[site] || []).forEach(function (pair) {
    out = out.split(pair[0]).join(pair[1]);
  });
  return out;
}

// The shift start day: the latest day on or before the hour whose weekday
// is the weekday the raw shift name starts with ("FriNight", "FriDay -
// Blue"). Hour = wall clock written as UTC ms. Result: a day number.
function startDay(hour, raw) {
  var hourDay = Math.floor(hour / DAY_MS);
  var wanted = DAYS.indexOf(String(raw || '').slice(0, 3).toLowerCase());
  if (wanted === -1) {
    return hourDay;
  }
  var weekday = (new Date(hour).getUTCDay() + 6) % 7;
  var back = ((weekday - wanted) % 7 + 7) % 7;
  return hourDay - back;
}

var groups = {};
var order = [];
msg.rows.forEach(function (row) {
  var part = fixPart(row.PartName);
  var known = shiftMap.hasOwnProperty(row.ShiftName);
  var shift = known ? shiftMap[row.ShiftName] : null;
  var day = startDay(row.Hour, row.ShiftName);
  var unique = row['Unique Machine Name'];
  var colour = row['Shift Colour'];
  var key = [
    day,
    unique,
    shift,
    colour,
    part
  ].join('|');
  var g = groups[key];
  if (!g) {
    g = {
      'Record Type': 'Run Rate',
      'Date': day,
      'SiteName': site,
      'MachineName': row.MachineName,
      'Unique Machine Name': unique,
      'ShiftName': shift,
      'Dept': row['Dept'],
      'Area': row['Area'],
      'Product Type': row['Product Type'],
      'In EU Report': false,
      'AreaName': row.AreaName,
      'PartName': part,
      'Product Key': unique + ' ' + part,
      'Shift Colour': colour,
      'Data Source': row['Data Source'],
      'loaded_at': row.loaded_at,
      'RR Hours': 0,
      'RR Good Parts': 0,
      'RR Capacity': 0
    };
    var format = formats[g['Product Key']];
    FORMAT_COLUMNS.forEach(function (column) {
      g[column] = format ? format[column] : null;
    });
    groups[key] = g;
    order.push(key);
  }
  g['RR Hours'] += 1;
  g['RR Good Parts'] += Number(row['Good Parts']) || 0;
  g['RR Capacity'] += Number(row.Capacity) || 0;
  g['In EU Report'] = g['In EU Report'] || row['In EU Report'] === true;
  if (row.loaded_at > g.loaded_at) {
    g.loaded_at = row.loaded_at;
  }
});

var hours = msg.rows.length;
msg.rows = order.map(function (key) {
  return groups[key];
});
msg.table = 'Run Rate';
node.status({
  fill: 'green',
  shape: 'dot',
  text: site + ' ' + msg.month + ': ' + hours + ' h -> ' + msg.rows.length
});
return msg;
