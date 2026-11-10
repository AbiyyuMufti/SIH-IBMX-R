// Builds Volume_CoV_EU and the filler rows that keep the Tableau blend whole
// (the rule of f1-filler-rows.js, for one line and day). In: msg.rows,
// lossShift, day, look (y2, y3). Out: msg.rows.Volume_CoV_EU, filler rows
// (Data Source = Filler) in the plan and loss rows, msg.tables.
var SITE = 'Chartres';
var FILLER = 'Filler';
// Same threshold as scripts/vfc/b9-cov-rows.js.
var MIN_GOOD_PARTS = 1000;
var MINUTE_MS = 60000;
var PLAN_ZERO = [
  'Good Parts',
  'Capacity',
  'Total Time',
  'Planned OpT',
  'OEE Time',
  'Downtime Units',
  'Defect Parts',
  'source_hours'
];
var LOSS_ZERO = [
  'Duration',
  'Loss Units',
  'Volume Total',
  'Time in Mins',
  'comment_count'
];

function key(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

var day = msg.day;
var machine = day.machine;
var line = msg.look.lines[key(msg.row.fileLine)];
var plan = msg.rows.Plan_OPT_EU;
var loss = msg.rows.Daily_Losses_EU;

// Volume_CoV_EU: per shift, Good Parts over MIN_GOOD_PARTS.
var groups = {};
var order = [];
plan.forEach(function (row) {
  var shift = row.ShiftName;
  if (!groups[shift]) {
    groups[shift] = {
      row: row,
      good: 0,
      time: 0,
      cap: null
    };
    order.push(shift);
  }
  var group = groups[shift];
  group.good += row['Good Parts'] || 0;
  group.time += row['Total Time'] || 0;
  if (group.cap === null || (row.Capacity || 0) > group.cap) {
    group.cap = row.Capacity;
  }
});
var cov = [];
order.forEach(function (shift) {
  var group = groups[shift];
  if (group.good <= MIN_GOOD_PARTS) {
    return;
  }
  cov.push({
    Date: day.dayNumber,
    MachineName: machine,
    'Shift Colour': shift,
    'Good Parts Sum': group.good,
    'Shift Machine Key': shift + ' ' + machine,
    'Cap Max': group.cap,
    'Time on Shift': group.time * MINUTE_MS,
    Dept: null,
    Area: null,
    'Product Type': null,
    'Unique Machine Name': line.unique,
    SiteName: SITE,
    'Data Source': 'Excel',
    'In EU Report': line.inEu.Volume_CoV_EU,
    loaded_at: day.loadedAt
  });
});
msg.rows.Volume_CoV_EU = cov;

// Filler: the machine columns shared by both tables.
function fillerBase(shift) {
  return {
    SiteName: SITE,
    'Unique Machine Name': line.unique,
    Dept: line.dept,
    Area: line.area,
    'Product Type': line.type,
    MachineName: machine,
    ShiftName: shift,
    'Data Source': FILLER,
    loaded_at: day.loadedAt,
    Date: day.dayNumber
  };
}

// Every plan shift with no loss row gets one filler loss row.
var lossShifts = {};
loss.forEach(function (row) {
  lossShifts[row.ShiftName] = true;
});
order.forEach(function (shift) {
  if (lossShifts[shift]) {
    return;
  }
  var row = fillerBase(shift);
  row['In EU Report'] = line.inEu.Daily_Losses_EU;
  row.ShiftStartDate = day.dayNumber;
  row['Shift colour'] = null;
  row['Shift Time'] = shift;
  LOSS_ZERO.forEach(function (column) {
    row[column] = 0;
  });
  loss.push(row);
});

// A day with losses and no plan gets one filler plan row.
if (!plan.length && msg.rows.Daily_Losses_EU.length) {
  var noPlan = fillerBase(msg.lossShift.name);
  noPlan['In EU Report'] = line.inEu.Plan_OPT_EU;
  noPlan.AreaName = line.areaName;
  noPlan['Shift Colour'] = null;
  noPlan.ShiftStartTime = msg.lossShift.start;
  noPlan['Targets Key'] = machine + ' 01/' + day.iso.slice(5, 7) + '/' +
    day.iso.slice(0, 4);
  PLAN_ZERO.forEach(function (column) {
    noPlan[column] = 0;
  });
  plan.push(noPlan);
}

msg.tables = [
  'Plan_OPT_EU',
  'Time_Utilisation_EU',
  'Daily_Losses_EU',
  'Volume_CoV_EU'
];
return msg;
