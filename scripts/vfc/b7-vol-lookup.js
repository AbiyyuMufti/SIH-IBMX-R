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

function minutes(value) {
  var parts = /^(\d+):(\d{2}):(\d{2})$/.exec(String(value).trim());
  if (!parts) {
    return null;
  }
  return Number(parts[1]) * 60 + Number(parts[2]) + Number(parts[3]) / 60;
}

rows.forEach(function (row) {
  var machine = row.MachineName;
  var day = row.ShiftStartDate;
  if (!machine || !day) {
    return;
  }
  var text = day.slice(8, 10) + '/' + day.slice(5, 7) + '/' + day.slice(0, 4);
  var key = text + ' ' + machine + ' ' +
    replaceAll(row.OEELossLvl3Group, rule.group) + ' ' +
    replaceAll(row.OEELossLvl3SubGroup, rule.sub) + ' ' + row.OEELossLvl3Desc;
  var units = Number(String(row['Loss Units']).trim());
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
