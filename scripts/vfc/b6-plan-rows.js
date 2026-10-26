// Builds the plan OPT and time utilisation rows of one site and month with
// the rules of the report queries. In: msg.payload = parsed month file, flow
// context shiftMap and targets_<site>. Out 1: plan table, out 2: time
// utilisation table (for the decide nodes), out 3: a check log line.

// Machines both the EU and the site reports drop. The EU scope (In EU
// Report) comes from the report scope file in a later node.
var RULES = {
  Hull: {
    planSkip: [
      'GT4 - Auto'
    ],
    utilSkip: [
      'GT4 - Auto'
    ],
    replaceText: [
      ['Gavi 12 X 150 Russian Crypto', 'Gavi 12 x 150 russian Crypto']
    ]
  },
  Nottingham: {
    planSkip: [
      'N11 Auto'
    ],
    utilSkip: [
      'N11 Auto'
    ]
  },
  Weinheim: {
    planSkip: [
      'N11 Auto'
    ],
    utilSkip: [],
    partCutChars: 8
  }
};
var UTIL_ALL_TIME = 1440;

var site = msg.site;
var rule = RULES[site] || {};
var rows = Array.isArray(msg.payload) ? msg.payload : [];
var shiftMap = flow.get('shiftMap') || {};
var targets = flow.get('targets_' + site) || {};
var count = {
  read: rows.length,
  planned: 0,
  planSkipped: 0,
  utilSkipped: 0,
  noShift: {},
  noTarget: {}
};
var planRows = [];
var utilByKey = {};
var utilOrder = [];

function inList(list, value) {
  return !!list && list.indexOf(value) !== -1;
}

// The csv node leaves empty cells out of the row: an empty text is ''.
function asText(value) {
  return value === undefined || value === null ? '' : String(value);
}

// Days since 1970-01-01 of a date text YYYY-MM-DD: the value of a DATE column.
function dayNumber(text) {
  var year = Number(text.slice(0, 4));
  var month = Number(text.slice(5, 7));
  var day = Number(text.slice(8, 10));
  return Date.UTC(year, month - 1, day) / 86400000;
}

function number(value) {
  var text = value === undefined || value === null ? '' : String(value).trim();
  return text === '' || isNaN(Number(text)) ? null : Number(text);
}

// "H:MM:SS" (hours can pass 24) -> {whole: minutes without seconds, exact}.
function minutes(value) {
  var parts = /^(\d+):(\d{2}):(\d{2})$/.exec(String(value).trim());
  if (!parts) {
    return null;
  }
  var base = Number(parts[1]) * 60 + Number(parts[2]);
  return {
    whole: base,
    exact: base + Number(parts[3]) / 60
  };
}

// Part name of the site: text replaced, or the first characters cut off (the
// Weinheim part code and its space, as the report does). Trailing spaces go:
// the report data has none (leading spaces stay).
function replaceText(text) {
  var out = rule.partCutChars ? text.slice(rule.partCutChars) : text;
  out = out.replace(/\s+$/, '');
  (rule.replaceText || []).forEach(function (pair) {
    out = out.split(pair[0]).join(pair[1]);
  });
  return out;
}

rows.forEach(function (row) {
  var machine = row.MachineName;
  if (machine === undefined || machine === null || machine === '') {
    return;
  }
  var date = row['YYYY-MM-DD'];
  var total = minutes(row['Total Time']);
  var planned = minutes(row['Planned OpT']);
  var used = minutes(row['OEE Time']);
  var unique = machine + '-' + site;

  // Time utilisation: its own machine rules, sums per machine and day.
  if (inList(rule.utilSkip, machine)) {
    count.utilSkipped++;
  } else {
    var key = date + '|' + machine;
    if (!utilByKey[key]) {
      utilByKey[key] = {
        'Date': dayNumber(date),
        'MachineName': machine,
        'OEE Time Total': 0,
        'Total Time Total': 0,
        'Planned OPT Total': 0,
        'SiteName': site,
        'Unique Machine Name': unique,
        'All Time': UTIL_ALL_TIME,
        'loaded_at': msg.loadedAt
      };
      utilOrder.push(key);
    }
    utilByKey[key]['Total Time Total'] += total ? total.exact : 0;
    utilByKey[key]['Planned OPT Total'] += planned ? planned.exact : 0;
    utilByKey[key]['OEE Time Total'] += used ? used.exact : 0;
  }

  // Plan OPT: the machines the site drops.
  if (inList(rule.planSkip, machine)) {
    count.planSkipped++;
    return;
  }
  var part = replaceText(asText(row.PartName));
  var known = shiftMap.hasOwnProperty(row.ShiftName);
  var shift = known ? shiftMap[row.ShiftName] : null;
  if (shift === null) {
    count.noShift[row.ShiftName] = true;
  }
  var monthText = '01/' + date.slice(5, 7) + '/' + date.slice(0, 4);
  var target = (targets[unique] || {})[monthText] || {};
  if (target.oee === undefined) {
    count.noTarget[unique] = true;
  }
  count.planned++;
  planRows.push({
    'Date': dayNumber(date),
    'AreaName': asText(row.AreaName),
    'MachineName': machine,
    'ShiftName': shift,
    'PartName': part,
    'Good Parts': number(row['Good Parts']),
    'Capacity': number(row.Capacity),
    'Total Time': total ? total.whole : null,
    'Planned OpT': planned ? planned.whole : null,
    'OEE Time': used ? used.whole : null,
    'Downtime Units': number(row['Downtime Units']),
    'SiteName': site,
    'Unique Machine Name': unique,
    'Product Key': unique + ' ' + part,
    'UPDT Target': target.updt === undefined ? null : target.updt,
    'PDT Target': target.pdt === undefined ? null : target.pdt,
    'OEE Target': target.oee === undefined ? null : target.oee,
    'source_hours': null,
    'loaded_at': msg.loadedAt
  });
});

function tableMsg(table, tableRows) {
  return {
    table: table,
    rows: tableRows,
    failed: [],
    skipped: [],
    itemCount: 1,
    site: site,
    month: msg.month,
    day: msg.day,
    mode: msg.mode,
    loadedAt: msg.loadedAt,
    job: msg.job
  };
}

function wants(table) {
  return msg.job.tables.indexOf(table) !== -1;
}

var utilRows = utilOrder.map(function (key) {
  return utilByKey[key];
});
var text = site + ' ' + msg.month + ': read ' + count.read + ' rows, plan ' +
  count.planned + ' (left out ' + count.planSkipped + '), time utilisation ' +
  utilRows.length + ' machine-days (left out ' + count.utilSkipped + ' rows)';
var noShift = Object.keys(count.noShift);
if (noShift.length) {
  text += ', shift not mapped: ' + noShift.slice(0, 5).join(' / ');
}
var noTarget = Object.keys(count.noTarget);
if (noTarget.length) {
  text += ', no OEE target for ' + noTarget.length + ' machine(s): ' +
    noTarget.slice(0, 5).join(' / ');
}
node.status({
  fill: planRows.length ? 'green' : 'yellow',
  shape: 'dot',
  text: site + ' ' + msg.month + ': ' + planRows.length + ' plan rows'
});
var utilMsg = tableMsg('Time_Utilisation_EU', utilRows);
return [
  wants('Plan_OPT_EU') ? tableMsg('Plan_OPT_EU', planRows) : null,
  wants('Time_Utilisation_EU') ? utilMsg : null,
  {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] CHECK ' + text
  }
];
