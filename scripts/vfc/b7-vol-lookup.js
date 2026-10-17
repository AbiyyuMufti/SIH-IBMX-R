// Builds the volume loss correction lookup of one site and month.
// In: msg.payload = parsed month file. Stores flow context vc_<site>_<month>:
// key (date machine group subgroup description, as the report builds it) ->
// {u: loss units rounded to a whole number, m: time in minutes with seconds}.
var BREAKDOWN = [
  ['Breakdown - Mechanical', 'Breakdown'],
  ['Breakdown - Electrical', 'Breakdown']
];
// Text replacements of the report queries of each site, in their order.
var RULES = {
  Hull: {
    sub: BREAKDOWN.concat([
      ['In Process Quality Control', 'In process Quality Control'],
      ['Lack of resources', 'Lack of Resource']
    ]),
    group: []
  },
  Nottingham: {
    sub: BREAKDOWN.concat([
      ['Lack of resources', 'Lack of Resource']
    ]),
    group: [
      ['Planned Losses', 'Planned Loss'],
      ['Unplanned Losses', 'Unplanned Loss']
    ]
  },
  Weinheim: {
    sub: [],
    group: []
  }
};
var rule = RULES[msg.site] || {
  sub: [],
  group: []
};
var rows = Array.isArray(msg.payload) ? msg.payload : [];
var map = {};
var count = 0;

function replaceAll(text, pairs) {
  var out = text;
  pairs.forEach(function (pair) {
    out = out.split(pair[0]).join(pair[1]);
  });
  return out;
}

// The csv node leaves empty cells out of the row: an empty text is ''.
function asText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function minutes(value) {
  var parts = /^(\d+):(\d{2}):(\d{2})$/.exec(String(value).trim());
  if (!parts) {
    return null;
  }
  return Number(parts[1]) * 60 + Number(parts[2]) + Number(parts[3]) / 60;
}

rows.forEach(function (row) {
  var machine = asText(row.MachineName);
  var day = asText(row.ShiftStartDate);
  if (!machine || !day) {
    return;
  }
  var dayText = day.slice(8, 10) + '/' + day.slice(5, 7) + '/' +
    day.slice(0, 4);
  var key = dayText + ' ' + machine + ' ' +
    replaceAll(asText(row.OEELossLvl3Group), rule.group) + ' ' +
    replaceAll(asText(row.OEELossLvl3SubGroup), rule.sub) + ' ' +
    asText(row.OEELossLvl3Desc);
  var units = asText(row['Loss Units']).trim() === '' ? NaN :
    Number(asText(row['Loss Units']).trim());
  // Two correction rows can get the same key after the text replacements
  // (Breakdown - Electrical and - Mechanical): the first one is kept, as the
  // report does (checked against its Daily Losses table, 2026-10-17).
  if (map[key] !== undefined) {
    return;
  }
  map[key] = {
    u: isNaN(units) ? null : Math.round(units),
    m: minutes(row.Time)
  };
  count++;
});
flow.set('vc_' + msg.site + '_' + msg.month, map);
node.status({
  fill: 'green',
  shape: 'dot',
  text: msg.site + ' ' + msg.month + ': ' + count + ' correction rows'
});
delete msg.payload;
return msg;
