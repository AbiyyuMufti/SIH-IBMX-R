// Builds the Plan_OPT_EU rows (one per Template row: line, day, shift,
// order) and the Time_Utilisation_EU row of one line and day.
// In: msg.rows of t1 and the lookups in flow context (machines, scope,
// targets of Tuzla). Out 1: msg.tables. Out 2: 400 for an unknown line.
var SITE = 'Tuzla';
var DATA_SOURCE = 'Excel';
var ALL_TIME = 1440;
var FORMAT_COLUMNS = [
  'Brand',
  'Unit Size',
  'Unit Count/Format',
  'Extra Info'
];

function key(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

var machines = flow.get('machines_' + SITE) || {};
var scope = flow.get('scope_' + SITE) || {};
var machine = null;
Object.keys(machines).forEach(function (name) {
  if (key(name) === key(msg.line)) {
    machine = name;
  }
});
if (machine === null) {
  msg.statusCode = 400;
  msg.payload = {
    status: 'rejected',
    detail: 'line not in Machine Names: ' + msg.line
  };
  msg.logLevel = 'warn';
  msg.logText = 'rejected: line not in Machine Names: ' + msg.line;
  return [null, msg];
}

// The EU report scope rules (keep / drop) of one table.
function inEuReport(table) {
  var rules = scope[table] || {
    keep: {},
    drop: {}
  };
  var candidate = {
    MachineName: machine
  };
  var kept = Object.keys(rules.keep).every(function (column) {
    return rules.keep[column].indexOf(candidate[column] || '') !== -1;
  });
  var dropped = Object.keys(rules.drop).some(function (column) {
    return rules.drop[column].indexOf(candidate[column] || '') !== -1;
  });
  return kept && !dropped;
}

var info = machines[machine];
var unique = machine + '-' + SITE;
var iso = msg.iso;
var monthKey = '01/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
var dayNumber = Date.parse(iso + 'T00:00:00Z') / 86400000;
var loadedAt = msg.loadedAt || Date.now();
// Glidepaths are in percent (61.3): OEE Target with one decimal.
var targets = ((flow.get('targets_' + SITE) || {})[unique] || {})[
  monthKey
] || {};
var oeeTarget = targets.oee === undefined ? null :
  Math.round(targets.oee * 10) / 10;
var pdt = targets.pdt === undefined ? null : targets.pdt;
var updt = targets.updt === undefined ? null : targets.updt;

var plan = [];
var oeeTime = 0;
var netTime = 0;
var capacityDay = 0;
msg.rows.forEach(function (r) {
  // Theoretical units of the net operation time, as column U of Template.
  var capacity = r.speed * r.net / 60;
  var part = r.product || r.code;
  // Fire (dk) is the rejects as minutes at the theoretical speed.
  var defect = Math.round(r.losses['Fire (dk)'] * r.speed / 60);
  var runTime = r.speed ? r.good / r.speed * 60 : 0;
  oeeTime += runTime;
  netTime += r.net;
  capacityDay += capacity;
  if (!r.net && !r.good) {
    return;
  }
  var row = {
    Date: dayNumber,
    AreaName: info.Area,
    MachineName: machine,
    ShiftName: r.shift,
    PartName: part || null,
    'Good Parts': Math.round(r.good),
    Capacity: capacity,
    'Total Time': Math.trunc(r.net),
    'Planned OpT': Math.trunc(r.net),
    'OEE Time': r.speed ? Math.trunc(runTime) : null,
    'Downtime Units': capacity - r.good,
    SiteName: SITE,
    'Unique Machine Name': unique,
    'Product Key': unique + ' ' + part,
    'UPDT Target': updt,
    'PDT Target': pdt,
    'OEE Target': oeeTarget,
    Dept: info.Dept,
    Area: info.Area,
    'Product Type': info['Product Type'],
    'Defect Parts': defect,
    OEE: capacity ? Math.round((r.good / capacity) * 1000) / 1000 : null,
    'Shift Colour': null,
    ShiftStartTime: r.start,
    Target: capacity,
    'Targets Key': machine + ' ' + monthKey,
    'Data Source': DATA_SOURCE,
    'In EU Report': inEuReport('Plan_OPT_EU'),
    source_hours: null,
    loaded_at: loadedAt
  };
  FORMAT_COLUMNS.forEach(function (name) {
    row[name] = null;
  });
  plan.push(row);
});

var time = {
  Date: dayNumber,
  MachineName: machine,
  'OEE Time Total': oeeTime,
  'Total Time Total': netTime,
  'Planned OPT Total': netTime,
  SiteName: SITE,
  'Unique Machine Name': unique,
  'All Time': ALL_TIME,
  Dept: info.Dept,
  Area: info.Area,
  'Product Type': info['Product Type'],
  'Data Source': DATA_SOURCE,
  'In EU Report': inEuReport('Time_Utilisation_EU'),
  loaded_at: loadedAt
};

msg.machine = machine;
msg.unique = unique;
msg.info = info;
msg.capacityDay = capacityDay;
msg.inEuLosses = inEuReport('Daily_Losses_EU');
msg.tables = {
  Plan_OPT_EU: plan,
  Time_Utilisation_EU: netTime ? [time] : []
};
return [msg, null];
