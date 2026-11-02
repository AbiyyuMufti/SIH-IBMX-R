// Turns the Provideam answer of one task into the source CSV file, the text
// the SharePoint exports had (docs/provideam-reports.md, October 2026).
// In: the HTTP answer, msg.task. Out 1: the file for the write node (not in
// dry run), out 2: the task result for the join, out 3: a log line.
var HEADS = {
  plan_opt: [
    'SiteName',
    'YYYY-MM-DD',
    'AreaName',
    'MachineName',
    'ShiftName',
    'ShiftStartTime',
    'PartName',
    'Good Parts',
    'Defect Parts',
    'Target',
    'Capacity',
    'OEE',
    'Total Time',
    'Planned OpT',
    'OEE Time',
    'Downtime Units'
  ],
  run_rates: [
    'SiteName',
    'AreaName',
    'MachineName',
    'YYYY-MM-DD HH',
    'PartName',
    'ShiftName',
    'Good Parts',
    'Capacity'
  ],
  line_losses: [
    'SiteName',
    'StartTime',
    'MachineName',
    'PartName',
    'ShiftName',
    'OEELossLvl3Group',
    'OEELossLvl3SubGroup',
    'OEELossLvl3Desc',
    'Duration',
    'ShiftStartDate',
    'Comment'
  ],
  volume_loss_correction: [
    'SiteName',
    'ShiftStartDate',
    'MachineName',
    'OEELossLvl3Group',
    'OEELossLvl3SubGroup',
    'OEELossLvl3Desc',
    'Time',
    'Loss Units'
  ]
};
var cfg = flow.get('cfg');
var task = msg.task;
var site = task.site;

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}
// Seconds as HH:MM:SS. Provideam rounds a half second to even
// (11376.5 s = 03:09:36).
function hms(value) {
  var n = Number(value) || 0;
  var s = Math.round(n);
  if (Math.abs(n % 1) === 0.5 && s % 2) {
    s -= 1;
  }
  return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) +
    ':' + pad(s % 60);
}
function fix2(value) {
  return (Number(value) || 0).toFixed(2);
}
function whole(value) {
  return Math.round(Number(value) || 0);
}
// 0.5125 is 51.3%: round half up after the float noise is cut.
function percent(value) {
  var tenths = Number(((Number(value) || 0) * 1000).toPrecision(12));
  return (Math.round(tenths) / 10).toFixed(1) + '%';
}
function stamp(value) {
  return String(value || '').replace('T', ' ').slice(0, 19);
}
// 10/29/2026 12:00:00 AM -> 2026-10-29
function usDate(value) {
  var m = /^(\d+)\/(\d+)\/(\d{4})/.exec(String(value || ''));
  return m ? m[3] + '-' + pad(Number(m[1])) + '-' + pad(Number(m[2])) : '';
}
// The export has no quotes around a value (the API has them on some part
// names) and no tabs (comments).
function cell(value) {
  var s = value === null || value === undefined ? '' : String(value);
  s = s.replace(/^"(.*)"$/, '$1').replace(/\t/g, ' ');
  if (/[",\n\r]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowOf(x) {
  if (task.type === 'plan_opt') {
    return [
      site,
      x.fdYYYYMMDD,
      x.fdAreaName,
      x.fdMachineName,
      x.fdShiftName,
      stamp(x.fdShiftStartTime),
      x.fdPartName,
      whole(x.fnGoodParts_0),
      whole(x.fnDefectParts_0),
      fix2(x.fnTarget_0),
      fix2(x.fnCapacity_0),
      percent(x.fnOEE_0),
      hms(x.fnTotalTime_0),
      hms(x.fnPlannedOpT_0),
      hms(x.fnOEETime_0),
      fix2(x.fnDowntimeUnits_0)
    ];
  }
  if (task.type === 'run_rates') {
    return [
      site,
      x.fdAreaName,
      x.fdMachineName,
      x.fdYYYYMMDDHH + ':00',
      x.fdPartName,
      x.fdShiftName,
      whole(x.fnGoodParts_0),
      whole(x.fnCapacity_0)
    ];
  }
  if (task.type === 'line_losses') {
    return [
      site,
      stamp(x.fdStartTime),
      x.fdMachineName,
      x.fdPartDesc,
      x.fdShiftName,
      x.fdOEELossLvl3Type,
      x.fdOEELossLvl3SubGroup,
      x.fdOEELossLvl3Desc,
      hms(x.fdTime),
      String(x.fdShiftStartDate || '').slice(0, 10),
      x.fdModeComment
    ];
  }
  return [
    site,
    usDate(x.fdShiftStartDate),
    x.fdMachineName,
    x.fdOEELossLvl3Type,
    x.fdOEELossLvl3SubGroup,
    x.fdOEELossLvl3Desc,
    hms(x.fnTime_0),
    fix2(x.fnLossUnits_0)
  ];
}

// Which answer rows are file rows: the export has no Run events, and the
// correction keeps only the loss groups of the site (keepTypes).
function wanted(x) {
  if (x.rowDesc === 'GrandTotal' || !x.fdMachineName) {
    return false;
  }
  if (task.type === 'line_losses') {
    return x.fdOEELossLvl3Type !== 'Run';
  }
  if (task.type === 'volume_loss_correction') {
    return (task.keepTypes || []).indexOf(x.fdOEELossLvl3Type) !== -1;
  }
  return true;
}

var answer = msg.payload;
if (typeof answer === 'string') {
  try {
    answer = JSON.parse(answer);
  } catch (e) {
    answer = null;
  }
}
var key = task.type === 'volume_loss_correction' ?
  'processedLossData' : 'processedData';
var rows = answer && Array.isArray(answer[key]) ? answer[key] : null;
var where = task.day + ' [fetch] ' + site + ' ' + task.type;
var result = {
  site: site,
  type: task.type,
  day: task.day,
  ok: false,
  rows: 0
};
var file = null;
var line;

if (msg.statusCode !== 200 || !rows) {
  line = where + ': FAILED Provideam HTTP ' + msg.statusCode;
  if (msg.statusCode === 200) {
    line += ', no ' + key;
  }
} else {
  var out = [HEADS[task.type].join(',')];
  rows.forEach(function (x) {
    if (wanted(x)) {
      out.push(rowOf(x).map(cell).join(','));
    }
  });
  result.ok = true;
  result.rows = out.length - 1;
  var path = cfg.sourceFolder + '/' + task.type + '/site=' + site + '/';
  path += task.type + '_' + task.day + '.csv';
  line = where + ': ' + result.rows + ' rows';
  if (cfg.dryRun) {
    line += ', dry run (not written)';
  } else {
    line += ' to ' + path;
    file = {
      path: path,
      payload: out.join('\n') + '\n'
    };
  }
}

// The join sends when the last task of the run arrives (msg.complete).
var run = flow.get('fetchRun') || {};
run.done = (run.done || 0) + 1;
flow.set('fetchRun', run);
var joinMsg = {
  payload: result
};
if (run.done >= run.expected) {
  joinMsg.complete = true;
}

node.status({
  fill: result.ok ? 'green' : 'red',
  shape: 'dot',
  text: (run.done || 0) + '/' + (run.expected || '?') + ' ' + site + ' ' +
    task.type
});
return [
  file,
  joinMsg,
  {
    topic: 'log',
    payload: line
  }
];
