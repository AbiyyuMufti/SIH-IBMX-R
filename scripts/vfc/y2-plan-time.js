// Builds the Plan_OPT_EU rows (one per product slot) and the
// Time_Utilisation_EU row of the day. In: msg.row (y1), msg.payload (the
// file chartres_lookups.json). Out 1: msg.rows, msg.slots, msg.look.
// Out 2: 400 for a line that is not in the lookups.
var SITE = 'Chartres';
var DATA_SOURCE = 'Excel';
var ALL_TIME = 1440;
// Shift types of the workbook: report shift name and start hour (site
// answer 2026-11). Time_Utilisation uses TOR as the planned time.
var SHIFTS = [
  ['Semaine Matin', 'Morning', 5],
  ['Semaine Après Midi', 'Afternoon', 13],
  ['Semaine Nuit', 'Night', 21],
  ['Weekend Matin', 'Morning', 5],
  ['Weekend Nuit', 'Night', 17]
];
var HOUR_MS = 3600000;
var FORMAT_COLUMNS = [
  'Brand',
  'Unit Size',
  'Unit Count/Format',
  'Extra Info'
];

function norm(value) {
  var text = value === undefined || value === null ? '' : String(value);
  return text.replace(/\s+/g, ' ').trim();
}

function key(value) {
  return norm(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

function num(value) {
  if (value === '' || value === undefined || value === null) {
    return 0;
  }
  return Number(value) || 0;
}

// The lookup file arrives as bytes, text or an object.
var look = msg.payload;
if (look && look.type === 'Buffer') {
  look = Buffer.from(look.data);
}
if (Buffer.isBuffer(look)) {
  look = look.toString('utf8');
}
if (typeof look === 'string') {
  look = JSON.parse(look);
}

var row = msg.row;
var line = look.lines[key(row.fileLine)];
if (!line) {
  msg.statusCode = 400;
  msg.payload = {
    status: 'rejected',
    detail: 'line not in the lookups: ' + row.fileLine
  };
  msg.logLevel = 'warn';
  msg.logText = 'rejected: line not in the lookups: ' + row.fileLine;
  return [null, msg];
}

var base = row.base;
var iso = row.iso;
var month = iso.slice(0, 7);
var machine = line.machine;
var unique = line.unique;
var dayNumber = Date.parse(iso + 'T00:00:00Z') / 86400000;
var loadedAt = Date.now();
var targets = (look.targets[key(machine)] || {})[month] || {};
var oeeTarget = targets['% OEE'];
oeeTarget = oeeTarget === undefined ? null :
  Math.round(oeeTarget * 1000) / 10;
var pdt = targets['Planned Downtime (Total)'];
var updt = targets['Unplanned Downtime (Total)'];
var machineColumns = {
  Dept: line.dept,
  Area: line.area,
  'Product Type': line.type
};

// Product slots: 5 shift types x PF1 to PF4.
var slots = [];
SHIFTS.forEach(function (shift) {
  for (var k = 1; k <= 4; k++) {
    var suffix = ' PF' + k + ' ' + shift[0];
    var slot = {
      type: shift[0],
      shift: shift[1],
      start: shift[2],
      code: norm(base['Code' + suffix]),
      name: norm(base['Nom' + suffix]),
      time: num(base['Temps' + suffix]),
      volume: num(base['Volume' + suffix]),
      waste: num(base['Déchets' + suffix]),
      speed: num(base['Vitesse' + suffix])
    };
    if (slot.code || slot.time || slot.volume) {
      slots.push(slot);
    }
  }
});

var plan = [];
var capacityDay = 0;
slots.forEach(function (slot) {
  // Good Parts = Volume - Déchets (user, 2026-11-10).
  var good = slot.volume - slot.waste;
  var capacity = slot.speed * slot.time;
  var part = slot.name || slot.code;
  capacityDay += capacity;
  var planRow = {
    Date: dayNumber,
    AreaName: line.areaName,
    MachineName: machine,
    ShiftName: slot.shift,
    PartName: part,
    'Good Parts': good,
    Capacity: capacity,
    'Total Time': Math.trunc(slot.time),
    'Planned OpT': Math.trunc(slot.time),
    'OEE Time': slot.speed ? Math.trunc(good / slot.speed) : null,
    'Downtime Units': capacity - good,
    SiteName: SITE,
    'Unique Machine Name': unique,
    'Product Key': unique + ' ' + part,
    'UPDT Target': updt === undefined ? null : updt,
    'PDT Target': pdt === undefined ? null : pdt,
    'OEE Target': oeeTarget,
    'Defect Parts': slot.waste,
    OEE: capacity ? Math.round((good / capacity) * 1000) / 1000 : null,
    'Shift Colour': null,
    ShiftStartTime: slot.start * HOUR_MS,
    Target: capacity,
    'Targets Key': machine + ' 01/' + iso.slice(5, 7) + '/' +
      iso.slice(0, 4),
    'Data Source': DATA_SOURCE,
    'In EU Report': line.inEu.Plan_OPT_EU,
    source_hours: null,
    loaded_at: loadedAt
  };
  Object.keys(machineColumns).forEach(function (name) {
    planRow[name] = machineColumns[name];
  });
  // The Format List columns, joined on Product Key.
  var format = look.format[planRow['Product Key']] || [];
  FORMAT_COLUMNS.forEach(function (name, i) {
    planRow[name] = format[i] === undefined ? null : format[i];
  });
  plan.push(planRow);
});

var tor = num(base.TOR);
var time = {
  Date: dayNumber,
  MachineName: machine,
  'OEE Time Total': num(base.TU),
  'Total Time Total': tor,
  'Planned OPT Total': tor,
  SiteName: SITE,
  'Unique Machine Name': unique,
  'All Time': ALL_TIME,
  'Data Source': DATA_SOURCE,
  'In EU Report': line.inEu.Time_Utilisation_EU,
  loaded_at: loadedAt
};
Object.keys(machineColumns).forEach(function (name) {
  time[name] = machineColumns[name];
});

msg.look = look;
msg.slots = slots;
msg.day = {
  iso: iso,
  dayNumber: dayNumber,
  machine: machine,
  capacity: capacityDay,
  loadedAt: loadedAt
};
msg.rows = {
  Plan_OPT_EU: plan,
  Time_Utilisation_EU: [time]
};
// The payload is the lookup file no more.
msg.payload = null;
return [msg, null];
