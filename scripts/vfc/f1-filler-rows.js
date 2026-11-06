// Builds the filler rows of one site and period (month or day) for the
// Tableau blend. In: msg.site, msg.period, msg.plan and msg.loss (rows of
// Plan_OPT_EU and Daily_Losses_EU with their key and machine columns),
// msg.loadedAt (ms). Out: msg.fillerPlan, msg.fillerLoss, msg.counts.
var DATA_SOURCE = 'Filler';
var PLAN = 'Plan_OPT_EU';
var LOSS = 'Daily_Losses_EU';
// Columns copied from a row of the same line (and table if possible).
var LINE_COLUMNS = [
  'SiteName',
  'Unique Machine Name',
  'Dept',
  'Area',
  'Product Type'
];
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

var scope = flow.get('scope_' + msg.site) || {};
var plan = msg.plan || [];
var loss = msg.loss || [];
var counts = {
  plan: 0,
  loss: 0,
  nullShift: 0,
  afterLastDay: 0,
  scopeRule: 0
};

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

// Same rule as node "Add machine and scope columns".
function inEuReport(row, table) {
  var rules = scope[table] || {
    keep: {},
    drop: {}
  };
  var kept = Object.keys(rules.keep).every(function (column) {
    return rules.keep[column].indexOf(text(row[column])) !== -1;
  });
  var dropped = Object.keys(rules.drop).some(function (column) {
    return rules.drop[column].indexOf(text(row[column])) !== -1;
  });
  return kept && !dropped;
}

// Rows by key (machine, shift, day) and the first row per line and per
// line + shift. A null ShiftName never links in Tableau: no key.
function index(rows, dayColumn) {
  var out = {
    keys: {},
    line: {},
    lineShift: {},
    nullShift: {},
    lastDay: ''
  };
  rows.forEach(function (row) {
    var machine = row.MachineName;
    var shift = text(row.ShiftName);
    var day = row[dayColumn];
    if (day > out.lastDay) {
      out.lastDay = day;
    }
    if (!out.line[machine]) {
      out.line[machine] = row;
    }
    if (!shift) {
      out.nullShift[machine + '|' + day] = true;
      return;
    }
    if (!out.lineShift[machine + '|' + shift]) {
      out.lineShift[machine + '|' + shift] = row;
    }
    var key = machine + '|' + shift + '|' + day;
    if (!out.keys[key]) {
      out.keys[key] = row;
    }
  });
  return out;
}

var planIndex = index(plan, 'Date');
var lossIndex = index(loss, 'ShiftStartDate');
// A day is filled only when both tables already have it (cut-off).
var lastDay = planIndex.lastDay < lossIndex.lastDay ?
  planIndex.lastDay : lossIndex.lastDay;

// One filler row of table `table` for the key of row `from` (other table).
function fillerRow(table, from, day, own) {
  var shift = text(from.ShiftName);
  var line = own.line[from.MachineName];
  var same = own.lineShift[from.MachineName + '|' + shift];
  var base = same || line || from;
  var row = {};
  LINE_COLUMNS.forEach(function (column) {
    row[column] = base[column] === undefined ? null : base[column];
  });
  row.MachineName = from.MachineName;
  row.ShiftName = shift;
  row['Data Source'] = DATA_SOURCE;
  row['loaded_at'] = msg.loadedAt;
  if (line) {
    row['In EU Report'] = base['In EU Report'];
  } else {
    row['In EU Report'] = inEuReport(row, table);
    counts.scopeRule++;
  }
  var colour = from['Shift Colour'] !== undefined ?
    from['Shift Colour'] : from['Shift colour'];
  if (table === PLAN) {
    row.Date = day;
    row.AreaName = line ? base.AreaName : null;
    row['Shift Colour'] = same ? same['Shift Colour'] : colour;
    row.ShiftStartTime = same ? same.ShiftStartTime : null;
    row['Targets Key'] = from.MachineName + ' 01/' + day.slice(5, 7) +
      '/' + day.slice(0, 4);
    PLAN_ZERO.forEach(function (column) {
      row[column] = 0;
    });
  } else {
    row.Date = day;
    row.ShiftStartDate = day;
    row['Shift colour'] = same ? same['Shift colour'] : colour;
    row['Shift Time'] = same ? same['Shift Time'] : null;
    LOSS_ZERO.forEach(function (column) {
      row[column] = 0;
    });
  }
  return row;
}

// Every key of `from` with no row in `to` gets one filler row in `table`.
function fill(table, from, to) {
  var out = [];
  Object.keys(from.keys).forEach(function (key) {
    if (to.keys[key]) {
      return;
    }
    var day = key.split('|')[2];
    if (day > lastDay) {
      counts.afterLastDay++;
      return;
    }
    out.push(fillerRow(table, from.keys[key], day, to));
  });
  return out;
}

msg.fillerLoss = [];
msg.fillerPlan = [];
if (plan.length && loss.length) {
  msg.fillerLoss = fill(LOSS, planIndex, lossIndex);
  msg.fillerPlan = fill(PLAN, lossIndex, planIndex);
}
counts.loss = msg.fillerLoss.length;
counts.plan = msg.fillerPlan.length;
// Line-days with a null ShiftName: no key, so no filler for them.
counts.nullShift = Object.keys(planIndex.nullShift).length +
  Object.keys(lossIndex.nullShift).length;
msg.counts = counts;
return msg;
