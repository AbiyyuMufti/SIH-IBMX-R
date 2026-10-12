// Collects the hours of every product and order of one asset and day.
// In: one filtered evaluateKPIs response (msg.job, msg.jobRun, jobCount).
// Out 1: when all are in, the asset message with msg.valueHours. Out 2:
// the asset result for the join when one of the calls failed.
var name = msg.h.asset_name;
var runs = flow.get('valueRuns') || {};
var run = runs[msg.jobRun];
if (!run) {
  run = {
    created: Date.now(),
    done: 0,
    failed: [],
    hours: { PRODUCT: {}, ORDER: {} }
  };
  runs[msg.jobRun] = run;
}
run.done += 1;

// An hour belongs to the value when it has parts (total, else good).
function partsOf(results) {
  var wanted = ['Total parts', 'Good parts'];
  var found = null;
  wanted.forEach(function (n) {
    (results || []).forEach(function (r) {
      if (r.name === n && !found) {
        found = r;
      }
    });
  });
  return found;
}

var label = msg.job.key + ' ' + msg.job.value;
var body = msg.payload;
if (msg.statusCode !== 200 || !body || typeof body !== 'object') {
  run.failed.push(label + ' HTTP ' + msg.statusCode);
} else {
  var parts = partsOf(body.results);
  var hours = [];
  ((parts && parts.groups) || []).forEach(function (g) {
    if (Number(g.value) > 0) {
      hours.push(Date.parse(g.time));
    }
  });
  run.hours[msg.job.key][msg.job.value] = hours;
}

if (run.done < msg.jobCount) {
  flow.set('valueRuns', runs);
  return null;
}
delete runs[msg.jobRun];
flow.set('valueRuns', runs);
delete msg.job;
delete msg.jobRun;
delete msg.jobCount;
delete msg.payload;
if (run.failed.length) {
  msg.payload = {
    assetId: msg.asset.id,
    name: name,
    failed: name + ': value KPIs failed, ' + run.failed[0],
    skipped: null,
    planRows: [],
    utilRows: [],
    lossRows: []
  };
  delete msg.hours;
  delete msg.kpiMeta;
  delete msg.shiftRules;
  return [null, msg];
}
msg.valueHours = run.hours;
return [msg, null];
