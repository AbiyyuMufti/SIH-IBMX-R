// Builds the Daily_Losses_EU rows: one per loss column (NR to the first
// product column, no "Nbre") with minutes above 0. In: msg.row, slots, day,
// line, targets, rows (y2) and the loss names in flow context.
// Out: msg.rows.Daily_Losses_EU, lossShift, notes.
var SITE = 'Chartres';
var DATA_SOURCE = 'Excel';
var HOUR_MS = 3600000;
// The losses of a day go to the plan shift with the most Temps (ties: the
// first of this list). No plan slot that day: Morning at 05:00.
var SHIFT_ORDER = ['Morning', 'Afternoon', 'Night'];
var NO_PLAN_SHIFT = {
  name: 'Morning',
  start: 5 * HOUR_MS
};
var FORMAT_COLUMNS = [
  'Brand',
  'Unit Size',
  'Unit Count/Format',
  'Extra Info'
];
var MACHINE_LOSS = /^(Dysf|Pannes?|Réglages?) /;
// Block rule for a loss column that is not in the loss names file: the start
// of the column name gives group and sub group (same as the history load).
var PREFIX = [
  ['^Dysf ', 'Unplanned Loss', 'Minor Stops'],
  ['^Pannes? ', 'Unplanned Loss', 'Breakdown'],
  ['^Réglages? ', 'Unplanned Loss', 'Adjustments'],
  ['^Orga', 'Planned Loss', 'Cleaning'],
  ['^Changement', 'Planned Loss', 'Product Changeover'],
  ['^Rupture', 'Unplanned Loss', 'Lack Of Resources'],
  ['^Qualité', 'Unplanned Loss', 'Quality Issues'],
  ['^Maintenance', 'Planned Loss', 'Planned Maintenance']
];
var FIRST_PRODUCT_COLUMN = 'Code PF1 Semaine Matin';

function norm(value) {
  var text = value === undefined || value === null ? '' : String(value);
  return text.replace(/\s+/g, ' ').trim();
}

function num(value) {
  if (value === '' || value === undefined || value === null) {
    return 0;
  }
  return Number(value) || 0;
}

var base = msg.row.base;
var iso = msg.day.iso;
var machine = msg.day.machine;
var line = msg.line;
var unique = line.unique;
var losses = flow.get('losses_' + SITE) || {};
var notes = [];
var targets = msg.targets.b || {};

// Shift of the losses.
function shiftOfLosses(slots) {
  if (!slots.length) {
    return NO_PLAN_SHIFT;
  }
  var byShift = {};
  var byType = {};
  slots.forEach(function (slot) {
    byShift[slot.shift] = (byShift[slot.shift] || 0) + slot.time;
    byType[slot.type] = (byType[slot.type] || 0) + slot.time;
  });
  var name = SHIFT_ORDER
    .filter(function (shift) {
      return byShift[shift] !== undefined;
    })
    .reduce(function (a, b) {
      return byShift[b] > byShift[a] ? b : a;
    });
  var type = Object.keys(byType)
    .filter(function (t) {
      return slots.some(function (s) {
        return s.type === t && s.shift === name;
      });
    })
    .reduce(function (a, b) {
      return byType[b] > byType[a] ? b : a;
    });
  var start = slots.filter(function (s) {
    return s.type === type;
  })[0].start;
  return {
    name: name,
    start: start * HOUR_MS
  };
}

// Names of one loss column: the map of the history load, else the block
// rule of the column name.
function names(column) {
  var known = losses[machine + '|' + column];
  if (known) {
    return {
      group: known[0],
      sub: known[1],
      desc: known[2],
      equipment: known[3]
    };
  }
  notes.push('loss column not in the map: ' + column);
  var rule = null;
  PREFIX.forEach(function (p) {
    if (!rule && new RegExp(p[0]).test(column)) {
      rule = p;
    }
  });
  var group = rule ? rule[1] : 'Unplanned Loss';
  var sub = rule ? rule[2] : 'Not Logged';
  var machineLoss = rule !== null && group === 'Unplanned Loss' &&
    MACHINE_LOSS.test(column);
  var desc = machineLoss ? column.replace(new RegExp(rule[0]), '') : column;
  return {
    group: group,
    sub: sub,
    desc: desc,
    equipment: machineLoss ? desc : 'Unclassed'
  };
}

var keys = Object.keys(base);
var first = keys.indexOf('NR');
var last = keys.indexOf(FIRST_PRODUCT_COLUMN);
if (first === -1 || last === -1 || last < first) {
  msg.statusCode = 400;
  msg.payload = {
    status: 'rejected',
    detail: 'NR or ' + FIRST_PRODUCT_COLUMN + ' is missing'
  };
  msg.logLevel = 'warn';
  msg.logText = 'rejected: NR or ' + FIRST_PRODUCT_COLUMN + ' is missing';
  return [null, msg];
}
var columns = ['NR'];
keys.slice(first + 1, last).forEach(function (name) {
  if (!/^Nbre/i.test(name)) {
    columns.push(name);
  }
});

var slots = msg.slots;
var main = null;
slots.forEach(function (slot) {
  if (main === null || slot.time > main.time) {
    main = slot;
  }
});
var lossShift = shiftOfLosses(slots);
var dmy = iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
var targetKeyDate = '01/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
var rows = [];
var lossMinutes = 0;
columns.forEach(function (column) {
  var minutes = num(base[column]);
  lossMinutes += minutes;
  if (minutes < 0) {
    notes.push('negative loss not loaded: ' + column + ' ' + minutes);
  }
  if (minutes <= 0) {
    return;
  }
  var n = names(column);
  var percent = targets[n.sub];
  var out = {
    Date: msg.day.dayNumber,
    Time: lossShift.start,
    MachineName: machine,
    PartName: null,
    'Shift Time': lossShift.name,
    ShiftName: lossShift.name,
    OEELossLvl3Group: n.group,
    OEELossLvl3SubGroup: n.sub,
    OEELossLvl3Desc: n.desc,
    Duration: Math.round(minutes),
    'Shift colour': null,
    SiteName: SITE,
    'Unique Machine Name': unique,
    'Breakdown Types': n.sub,
    ShiftStartDate: msg.day.dayNumber,
    Comment: null,
    'Product Key': null,
    'Volume Key': dmy + ' ' + machine + ' ' + n.group + ' ' + n.sub + ' ' +
      n.desc,
    'Loss Units': main && main.speed ? main.speed * minutes : null,
    'Time in Mins': minutes,
    'Equipment Loss Key': machine + ' ' + n.desc,
    Equipment: n.equipment,
    'Lvl 3 Loss Name': n.desc,
    'Loss Target Key': unique + ' ' + n.sub + ' ' + targetKeyDate,
    Value: null,
    'Volume Total': msg.day.capacity,
    'Loss Final Level': n.desc,
    Dept: line.dept,
    Area: line.area,
    'Product Type': line.type,
    'Data Source': DATA_SOURCE,
    'In EU Report': line.inEu.Daily_Losses_EU,
    target: percent === undefined ? null :
      Number((percent / 100).toPrecision(12)),
    'Batch ID': null,
    comment_count: null,
    loaded_at: msg.day.loadedAt
  };
  FORMAT_COLUMNS.forEach(function (name) {
    out[name] = null;
  });
  rows.push(out);
});

// The rules of the entry form: the rows are loaded, a failure is noted.
var top = num(base.TOP);
var tor = num(base.TOR);
var tu = num(base.TU);
var closed = num(base['Total Temps Fermeture']);
var slotTime = slots.reduce(function (sum, slot) {
  return sum + slot.time;
}, 0);
if (tor !== top - closed) {
  notes.push('TOR = TOP - not counted fails: ' + tor + ' vs ' + top +
    ' - ' + closed);
}
if (tu + lossMinutes !== tor) {
  notes.push('TU + NR + losses = TOR fails: ' + tu + ' + ' + lossMinutes +
    ' vs ' + tor);
}
if (slotTime !== tor) {
  notes.push('sum of product Temps = TOR fails: ' + slotTime + ' vs ' +
    tor);
}

msg.rows.Daily_Losses_EU = rows;
msg.lossShift = lossShift;
msg.notes = notes;
return [msg, null];
