// Maps one formatted run-log message to its day outcome.
// In: msg.line and the formatted log row in msg.payload.
// Out: the same message, unchanged.
var FLOW_NAME = '__FLOW__';
var SITE_NAME = '__SITE__';
var KEY = 'runStatus_' + FLOW_NAME;
var KIND = '__KIND__';
var status = glob.get(KEY);
var row = msg.payload || {};
var text = String(row.message || msg.line || '');
var day = row.production_day;
var now = new Date().toISOString();

if (status) {
  status.lastBeatAt = now;
  var item;
  if (KIND === 'month') {
    var monthMatch = /(?:^|\s)(\d{4}-\d{2})(?:\s|:)/.exec(text);
    var monthAt = monthMatch ? text.indexOf(monthMatch[1]) : -1;
    var site = row.site || text.slice(0, monthAt).trim();
    if (monthMatch && site) {
      item = status.months[monthMatch[1] + '|' + site];
      day = monthMatch[1] + '|' + site;
    }
  } else {
    item = status.days && status.days[day];
  }
  if (item) {
    if (/\bWRITING\b/.test(text)) {
      item.state = 'written';
      item.detail = '';
    } else if (/\bDRY RUN\b/.test(text)) {
      item.state = 'dry_run';
      item.detail = '';
    } else if (/FAILED, NOTHING WRITTEN:\s*/.test(text)) {
      item.state = 'failed';
      var failedAt = text.indexOf('FAILED, NOTHING WRITTEN:');
      item.detail = text.slice(failedAt + 25).trim().slice(0, 240);
    } else if (/NOTHING TO WRITE\b/.test(text)) {
      item.state = 'nothing';
      item.detail = '';
    } else if (/ERROR in /.test(text)) {
      item.detail = text.slice(text.indexOf('ERROR in '), 240);
    }
    if (item.state !== 'running' && item.state !== 'queued') {
      delete item.trail;
    }
    if (item.state !== 'running' || /ERROR in /.test(text)) {
      item.stepAt = now;
    }
    var dayKeys = Object.keys(status.days || {});
    var active = dayKeys.some(function (key) {
      return status.days[key].state === 'running' ||
        status.days[key].state === 'queued';
    });
    if (dayKeys.length && !active) {
      var failed = dayKeys.some(function (key) {
        return status.days[key].state === 'failed';
      });
      status.state = failed ? 'failed' : 'quiet';
      status.finishedAt = now;
    }
  }
  glob.set(KEY, status);
}
return msg;
