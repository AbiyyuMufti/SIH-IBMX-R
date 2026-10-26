// Builds the Daily_Losses_EU rows of one site and month with the steps of
// the report queries (Daily Line Losses H, N, W and Daily Losses Provideam).
// In: msg.payload = parsed line loss file; flow context vc_, cap_, equip_,
// targets_, shiftMap. Out 1: the table message, out 2: a check log line.

// Machines both the EU and the site reports drop. The EU scope (In EU
// Report) comes from the report scope file in a later node.
var EARLY_SKIP = [
  'B1 - Auto',
  'B4 Auto',
  'B5 Auto'
];
var GROUPS = [
  'Not Logged',
  'Planned Loss',
  'Unplanned Loss'
];
var BREAKDOWN = [
  ['Breakdown - Mechanical', 'Breakdown'],
  ['Breakdown - Electrical', 'Breakdown']
];
var HULL_FINAL = [
  ['Adjustment', 'Adjustments'],
  ['Start-Up/End-Up & Sanitization', 'Start up and Sanitisation'],
  ['In Process Quality Control', 'In Process Quality'],
  ['Lack Of Resource', 'Lack Of Resources'],
  ['Meals & Breaks', 'Breaks / Meals'],
  ['Minor Stop', 'Minor Stops'],
  ['Other', 'Others'],
  ['Product Change Over', 'Product Changeover'],
  ['Start Up And Sanitisation', 'Start up and Sanitisation'],
  ['Lack Of Resourcess', 'Lack Of Resources'],
  ['Operater Asset Care', 'Operator Asset Care'],
  ['Beakdown - Mechanical', 'Breakdown']
];
// Steps of each site, in the order of its query: text replacements before
// the volume key (keyReplace, groupBefore), after the correction join
// (afterJoin), Text.Proper (proper), the final subgroup list (final).
var RULES = {
  Hull: {
    breakdownTypes: true,
    earlyFilter: true,
    keyReplace: BREAKDOWN,
    groupBefore: [],
    afterJoin: [
      ['Adjustments', 'Adjustment'],
      ['Breaks and Meal', 'Meals & Breaks'],
      ['Lack of resources', 'Lack of Resource']
    ],
    groups: GROUPS,
    groupAfter: [],
    proper: true,
    final: HULL_FINAL
  },
  Nottingham: {
    breakdownTypes: true,
    earlyFilter: true,
    keyReplace: BREAKDOWN,
    groupBefore: [
      ['Planned Losses', 'Planned Loss'],
      ['Unplanned Losses', 'Unplanned Loss']
    ],
    afterJoin: [
      ['Breaks and Meal', 'Meals & Breaks'],
      ['Lack of resources', 'Lack of Resource']
    ],
    groups: GROUPS,
    groupAfter: [],
    proper: false,
    final: [
      ['Minor Stop', 'Minor Stops'],
      ['Lack of Resources', 'Lack Of Resources'],
      ['Other', 'Others'],
      ['Meals & Breakss', 'Breaks / Meals'],
      ['In Process Quality Control', 'In Process Quality'],
      ['Start up & Sanitisation', 'Start up and Sanitisation']
    ]
  },
  Weinheim: {
    breakdownTypes: false,
    earlyFilter: false,
    cutPart: 8,
    keyReplace: [],
    groupBefore: [],
    afterJoin: [],
    groups: null,
    groupAfter: [
      ['Planned Losses', 'Planned Loss'],
      ['Unplanned losses', 'Unplanned Loss']
    ],
    proper: true,
    final: [
      ['Adjustment', 'Adjustments'],
      ['Breakdowns', 'Breakdown'],
      ['Coding', 'Breakdown'],
      ['Meals&Breaks', 'Breaks / Meals'],
      ['Other', 'Others'],
      ['Start-Upend-Up Sanitization', 'Start up and Sanitisation'],
      ['Changeover', 'Product Changeover'],
      ['In Process Control', 'In Process Quality'],
      ['Rework', 'In Process Quality']
    ]
  }
};

var site = msg.site;
var rule = RULES[site] || RULES.Weinheim;
var rows = Array.isArray(msg.payload) ? msg.payload : [];
var vcMap = flow.get('vc_' + site + '_' + msg.month) || {};
var capMap = flow.get('cap_' + site + '_' + msg.month) || {};
var equipMap = flow.get('equip_' + site) || {};
var targets = flow.get('targets_' + site) || {};
var shiftMap = flow.get('shiftMap') || {};
var seen = {};
var out = [];
var count = {
  read: rows.length,
  dupes: 0,
  early: 0,
  group: 0,
  noUnits: 0,
  noEquip: 0,
  noTarget: 0,
  noShift: {}
};

function replaceAll(text, pairs) {
  var result = text;
  pairs.forEach(function (pair) {
    result = result.split(pair[0]).join(pair[1]);
  });
  return result;
}

// Text.Proper: the first letter of every word capital, the rest small.
function proper(text) {
  var result = '';
  for (var i = 0; i < text.length; i++) {
    var letter = text.charAt(i);
    var before = i ? text.charAt(i - 1) : ' ';
    var after = before.toLowerCase() === before.toUpperCase();
    result += after ? letter.toUpperCase() : letter.toLowerCase();
  }
  return result;
}

// The csv node leaves empty cells out of the row: an empty text is ''.
function asText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function minutes(value) {
  var parts = /^(\d+):(\d{2}):(\d{2})$/.exec(String(value).trim());
  return parts ? Number(parts[1]) * 60 + Number(parts[2]) : null;
}

// "H:MM:SS" (hours can pass 24) -> seconds, with the seconds of the file.
function seconds(value) {
  var parts = /^(\d+):(\d{2}):(\d{2})$/.exec(String(value).trim());
  if (!parts) {
    return null;
  }
  return Number(parts[1]) * 3600 + Number(parts[2]) * 60 + Number(parts[3]);
}

// Days since 1970-01-01 of a date text YYYY-MM-DD (a DATE column value).
function dayNumber(text) {
  var parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!parts) {
    return null;
  }
  return Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])) /
    86400000;
}

// Milliseconds of the day of a time text HH:MM:SS (the parquet node cannot
// write the Excel day 1899-12-30, so a time of day is on 1970-01-01).
function timeOfDay(text) {
  var secs = seconds(text);
  return secs === null ? null : secs * 1000;
}

// The target as text with a decimal point, like the report (15.0, 3.9).
function valueText(number) {
  if (number === null) {
    return null;
  }
  return Number.isInteger(number) ? number + '.0' : String(number);
}

function dayText(day) {
  return day.slice(8, 10) + '/' + day.slice(5, 7) + '/' + day.slice(0, 4);
}

rows.forEach(function (row) {
  var machine = row.MachineName;
  if (machine === undefined || machine === null || machine === '') {
    return;
  }
  var start = asText(row.StartTime);
  var mergedKey = machine + ' ' + start;
  if (seen[mergedKey]) {
    count.dupes++;
    return;
  }
  seen[mergedKey] = true;
  var group = asText(row.OEELossLvl3Group);
  var sub = asText(row.OEELossLvl3SubGroup);
  var desc = asText(row.OEELossLvl3Desc);
  var breakdownTypes = rule.breakdownTypes ? sub : null;
  sub = replaceAll(sub, rule.keyReplace);
  group = replaceAll(group, rule.groupBefore);
  if (rule.earlyFilter &&
      (group === '' || group === '0.Review Data' ||
        EARLY_SKIP.indexOf(machine) !== -1)) {
    count.early++;
    return;
  }
  var day = asText(row.ShiftStartDate);
  var daily = dayText(day);
  var volumeKey = daily + ' ' + machine + ' ' + group + ' ' + sub + ' ' + desc;
  var correction = vcMap[volumeKey];
  sub = replaceAll(sub, rule.afterJoin);
  var equipment = equipMap[machine + ' ' + desc] || [null];
  if (rule.groups && rule.groups.indexOf(group) === -1) {
    count.group++;
    return;
  }
  group = replaceAll(group, rule.groupAfter);
  sub = rule.proper ? proper(sub) : sub;
  sub = replaceAll(sub, rule.final);
  var unique = machine + '-' + site;
  var part = rule.cutPart ? asText(row.PartName).slice(rule.cutPart) :
    asText(row.PartName);
  // Trailing spaces go: the report data has none (as in the plan OPT rows).
  part = part.replace(/\s+$/, '');
  var shift = shiftMap.hasOwnProperty(row.ShiftName) ?
    shiftMap[row.ShiftName] : null;
  if (shift === null) {
    count.noShift[row.ShiftName] = true;
  }
  var monthText = '01/' + day.slice(5, 7) + '/' + day.slice(0, 4);
  var target = (targets[unique] || {})[monthText];
  var value = target && target.b && target.b[sub] !== undefined ?
    target.b[sub] : null;
  if (value === null) {
    count.noTarget++;
  }
  var duration = minutes(row.Duration);
  var durationSeconds = seconds(row.Duration);
  var units = null;
  if (correction && correction.u !== null && correction.m &&
      duration !== null) {
    units = correction.u * duration / correction.m;
  } else {
    count.noUnits++;
  }
  var capacity = capMap[machine + ' ' + daily];
  equipment.forEach(function (name) {
    if (name === null) {
      count.noEquip++;
    }
    out.push({
      'Date': dayNumber(start.slice(0, 10)),
      'Time': timeOfDay(start.slice(11, 19)),
      'MachineName': machine,
      'PartName': part,
      'Shift Time': shift,
      'ShiftName': shift,
      'OEELossLvl3Group': group,
      'OEELossLvl3SubGroup': sub,
      'OEELossLvl3Desc': desc,
      'Duration': durationSeconds === null ? null : durationSeconds * 1000,
      'SiteName': site,
      'Unique Machine Name': unique,
      'Breakdown Types': breakdownTypes,
      'ShiftStartDate': dayNumber(day),
      'Comment': asText(row.Comment) === '' ? null : asText(row.Comment),
      'Product Key': unique + ' ' + part,
      'Volume Key': volumeKey,
      'Loss Units': units,
      'Time in Mins': durationSeconds === null ? null : durationSeconds / 60,
      'Equipment Loss Key': machine + ' ' + desc,
      'Equipment': name,
      'Lvl 3 Loss Name': desc,
      'Loss Target Key': unique + ' ' + sub + ' ' + monthText,
      'Value': valueText(value),
      'Volume Total': capacity === undefined ? null : capacity,
      'Loss Final Level': desc,
      'target': value === null ? null : value / 100,
      'batch_id': null,
      'comment_count': null,
      'loaded_at': msg.loadedAt
    });
  });
});
flow.set('vc_' + site + '_' + msg.month, undefined);
flow.set('cap_' + site + '_' + msg.month, undefined);

var text = site + ' ' + msg.month + ': read ' + count.read + ' rows, kept ' +
  out.length + ' (duplicate starts ' + count.dupes + ', early filter ' +
  count.early + ', group filter ' + count.group + '), no loss units ' +
  count.noUnits + ', no equipment ' + count.noEquip + ', no target ' +
  count.noTarget;
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
    table: 'Daily_Losses_EU',
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
