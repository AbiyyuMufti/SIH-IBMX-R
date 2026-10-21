// Merges the hourly evaluateKPIs answers into one answer of the whole day,
// the same shape as the day call (results with their hourly groups).
// In: msg.payload = [{statusCode, body}] in hour order (join). Out: the day
// answer with msg.statusCode, to the same check node as the day call.
var parts = Array.isArray(msg.payload) ? msg.payload : [];

// Short text of the API error (errors[0].message), else the raw body.
function apiMessage(body) {
  var list = body && (body.errors || (body.data && body.data.errors));
  if (list && list.length && list[0].message) {
    return String(list[0].message);
  }
  return JSON.stringify(body).slice(0, 200);
}

// The day join of the flow gets its msg.parts back.
if (msg.dayParts === undefined) {
  delete msg.parts;
} else {
  msg.parts = msg.dayParts;
}
delete msg.dayParts;

var bad = parts.filter(function (p) {
  return !p || p.statusCode !== 200 || !p.body || typeof p.body !== 'object';
})[0];
if (bad || !parts.length) {
  msg.statusCode = bad ? bad.statusCode : 413;
  var text = 'also on 1 h windows: ';
  text += bad ? apiMessage(bad.body) : 'no hourly answer';
  msg.payload = {
    errors: [
      {
        message: text
      }
    ]
  };
  return msg;
}

// Step 1: the groups of every KPI, in the order the hours came.
var byName = {};
var order = [];
parts.forEach(function (p) {
  (p.body.results || []).forEach(function (r) {
    if (!byName[r.name]) {
      byName[r.name] = {
        name: r.name,
        groups: []
      };
      order.push(r.name);
    }
    byName[r.name].groups = byName[r.name].groups.concat(r.groups || []);
  });
});

// Step 2: the day answer. Unit and missing mappings of the first hour.
var first = parts[0].body;
var body = {
  productUnit: first.productUnit,
  results: order.map(function (name) {
    return byName[name];
  })
};
if (first.missingMapping) {
  body.missingMapping = first.missingMapping;
}
msg.statusCode = 200;
msg.payload = body;
if (!msg.job) {
  msg.kpiHourParts = parts.length;
}
return msg;
