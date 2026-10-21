// Turns the SIH rows of the day into the report columns of Plan_OPT_EU,
// Time_Utilisation_EU and Daily_Losses_EU. In: msg.planRows, utilRows,
// lossRows; flow context targets_, machines_, shiftMap. Out: msg.tables =
// {table: [{out: folder, rows}]} and notes in msg.summary.notes.
var DATA_SOURCE = 'SIH';
// Shift names of the report: a SIH shift with one of these names is kept.
var REPORT_SHIFTS = [
  'Red',
  'Green',
  'Gold',
  'Blue',
  'Day',
  'Night',
  'Afternoon'
];
// The sub group of a stop without a category, as in the report.
var NO_SUB_GROUP = 'Not Logged';
var NO_EQUIPMENT = 'Unclassed';

var cfg = flow.get('cfg');
var site = cfg.site;
var targets = flow.get('targets_' + site) || {};
var machines = flow.get('machines_' + site) || {};
var shiftMap = flow.get('shiftMap') || {};
var lineById = {};
cfg.lines.forEach(function (line) {
  lineById[line.id] = line;
});
var noLine = {};
var noShift = {};
var noMachine = {};

// Days since 1970-01-01 of a date text YYYY-MM-DD (a DATE column value).
function dayNumber(text) {
  var y = Number(text.slice(0, 4));
  var m = Number(text.slice(5, 7));
  var d = Number(text.slice(8, 10));
  return Date.UTC(y, m - 1, d) / 86400000;
}

// Milliseconds of the day of a time text HH:MM:SS (on 1970-01-01).
function timeOfDay(text) {
  var parts = /^(\d{2}):(\d{2}):(\d{2})/.exec(String(text));
  if (!parts) {
    return null;
  }
  var secs = Number(parts[1]) * 3600 + Number(parts[2]) * 60;
  return (secs + Number(parts[3])) * 1000;
}

function whole(value) {
  return value === null || value === undefined ? null : Math.floor(value);
}

function rounded(value) {
  return value === null || value === undefined ? null : Math.round(value);
}

// The target as text with a decimal point, like the report (15.0, 3.9).
function valueText(number) {
  if (number === null) {
    return null;
  }
  return Number.isInteger(number) ? number + '.0' : String(number);
}

// The report machine of an asset: its Config line, else the SIH name.
function machineOf(row) {
  var line = lineById[row.unique_machine_name];
  if (!line) {
    noLine[row.machine_name] = true;
  }
  var name = line ? line.report : row.machine_name;
  var source = line && line.reportSource ? line.reportSource :
    cfg.siteSource;
  return {
    name: name,
    unique: name + '-' + site,
    out: source === cfg.source ? cfg.liveFolder : cfg.candidateFolder
  };
}

function shiftOf(name) {
  if (name === null || name === undefined) {
    return null;
  }
  if (REPORT_SHIFTS.indexOf(name) !== -1) {
    return name;
  }
  if (shiftMap.hasOwnProperty(name)) {
    return shiftMap[name];
  }
  noShift[name] = true;
  return name;
}

// Dept, Area, Product Type of the machine and the source.
function addMachine(row, name) {
  var info = machines[name];
  if (!info) {
    noMachine[name] = true;
  }
  row['Dept'] = info ? info.Dept : null;
  row['Area'] = info ? info.Area : null;
  row['Product Type'] = info ? info['Product Type'] : null;
  row['Data Source'] = DATA_SOURCE;
  return row;
}

function monthText(day) {
  return '01/' + day.slice(5, 7) + '/' + day.slice(0, 4);
}

// Rows grouped by output folder: [{out, rows}].
function byFolder(list) {
  var groups = {};
  var order = [];
  list.forEach(function (item) {
    if (!groups[item.out]) {
      groups[item.out] = [];
      order.push(item.out);
    }
    groups[item.out].push(item.row);
  });
  return order.map(function (out) {
    return {
      out: out,
      rows: groups[out]
    };
  });
}

var capacity = {};
var plan = msg.planRows.map(function (r) {
  var m = machineOf(r);
  var target = (targets[m.unique] || {})[monthText(r.date)] || {};
  var part = r.part_name;
  if (r.capacity !== null) {
    capacity[m.name] = (capacity[m.name] || 0) + r.capacity;
  }
  var row = {
    'Date': dayNumber(r.date),
    'AreaName': null,
    'MachineName': m.name,
    'ShiftName': shiftOf(r.shift_name),
    'PartName': part,
    'Good Parts': rounded(r.good_parts),
    'Capacity': r.capacity,
    'Total Time': whole(r.total_time),
    'Planned OpT': whole(r.planned_opt),
    'OEE Time': whole(r.oee_time),
    'Downtime Units': r.downtime_units,
    'SiteName': site,
    'Unique Machine Name': m.unique,
    'Product Key': m.unique + ' ' + (part || ''),
    'UPDT Target': target.updt === undefined ? null : target.updt,
    'PDT Target': target.pdt === undefined ? null : target.pdt,
    'OEE Target': target.oee === undefined ? null : target.oee
  };
  addMachine(row, m.name);
  row['source_hours'] = r.source_hours;
  row['loaded_at'] = r.loaded_at;
  return {
    out: m.out,
    row: row
  };
});

var util = msg.utilRows.map(function (r) {
  var m = machineOf(r);
  var row = {
    'Date': dayNumber(r.date),
    'MachineName': m.name,
    'OEE Time Total': r.oee_time_total,
    'Total Time Total': r.total_time_total,
    'Planned OPT Total': r.planned_opt_total,
    'SiteName': site,
    'Unique Machine Name': m.unique,
    'All Time': r.all_time
  };
  addMachine(row, m.name);
  row['loaded_at'] = r.loaded_at;
  return {
    out: m.out,
    row: row
  };
});

var loss = msg.lossRows.map(function (r) {
  var m = machineOf(r);
  var sub = r.loss_lvl3_sub_group || NO_SUB_GROUP;
  var group = r.loss_lvl3_group;
  var desc = r.loss_lvl3_desc;
  var day = r.shift_start_date;
  var daily = day.slice(8, 10) + '/' + day.slice(5, 7) + '/' +
    day.slice(0, 4);
  var month = monthText(day);
  var target = (targets[m.unique] || {})[month];
  var value = target && target.b && target.b[sub] !== undefined ?
    target.b[sub] : null;
  var part = r.part_name;
  var shift = shiftOf(r.shift_name);
  var ms = r.duration === null ? null : Math.round(r.duration * 60000);
  var volumeKey = daily + ' ' + m.name + ' ' + group + ' ' + sub + ' ' +
    desc;
  var row = {
    'Date': dayNumber(r.date),
    'Time': timeOfDay(r.time),
    'MachineName': m.name,
    'PartName': part,
    'Shift Time': shift,
    'ShiftName': shift,
    'OEELossLvl3Group': group,
    'OEELossLvl3SubGroup': sub,
    'OEELossLvl3Desc': desc,
    'Duration': ms,
    'SiteName': site,
    'Unique Machine Name': m.unique,
    'Breakdown Types': r.breakdown_types,
    'ShiftStartDate': dayNumber(day),
    'Comment': null,
    'Product Key': m.unique + ' ' + (part || ''),
    'Volume Key': volumeKey,
    'Loss Units': r.loss_units,
    'Time in Mins': r.duration,
    'Equipment Loss Key': m.name + ' ' + desc,
    'Equipment': r.equipment || NO_EQUIPMENT,
    'Lvl 3 Loss Name': desc,
    'Loss Target Key': m.unique + ' ' + sub + ' ' + month,
    'Value': valueText(value),
    'Volume Total': capacity.hasOwnProperty(m.name) ?
      capacity[m.name] : null,
    'Loss Final Level': desc
  };
  addMachine(row, m.name);
  row['target'] = value === null ? null : value / 100;
  row['batch_id'] = r.batch_id;
  row['comment_count'] = r.comment_count;
  row['loaded_at'] = r.loaded_at;
  return {
    out: m.out,
    row: row
  };
});

msg.tables = {
  Plan_OPT_EU: byFolder(plan),
  Time_Utilisation_EU: byFolder(util),
  Daily_Losses_EU: byFolder(loss)
};
var notes = [];
if (Object.keys(noLine).length) {
  notes.push('not a CONFIG line (SIH name kept): ' +
    Object.keys(noLine).join(' / '));
}
if (Object.keys(noShift).length) {
  notes.push('shift not in the report (SIH name kept): ' +
    Object.keys(noShift).join(' / '));
}
if (Object.keys(noMachine).length) {
  notes.push('not in Machine Names (no Dept, Area, Product Type): ' +
    Object.keys(noMachine).join(' / '));
}
msg.summary.notes = msg.summary.notes.concat(notes);
delete msg.planRows;
delete msg.utilRows;
delete msg.lossRows;
return msg;
