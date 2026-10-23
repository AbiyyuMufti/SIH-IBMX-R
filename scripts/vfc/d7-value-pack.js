// Packs the answer of one product or order call for the join of 6.4.
// In: one filtered evaluateKPIs response (msg.job, msg.parts of the value
// group). Out: msg.payload = {key, value, failed, hours}: the hours (ms)
// that have parts, or the failure text.

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
var packed = {
  key: msg.job.key,
  value: msg.job.value,
  failed: null,
  hours: []
};
if (msg.statusCode !== 200 || !body || typeof body !== 'object') {
  packed.failed = label + ' HTTP ' + msg.statusCode;
} else {
  var parts = partsOf(body.results);
  ((parts && parts.groups) || []).forEach(function (g) {
    if (Number(g.value) > 0) {
      packed.hours.push(Date.parse(g.time));
    }
  });
}
delete msg.job;
msg.payload = packed;
return msg;
