// Keeps the products of the day and sends one message per product and
// per order. In: the product list response (or none). Out 1: one message
// per value. Out 2: nothing to ask. Out 3: asset result for the join.
var STALE_MS = 21600000;
var MIN_PER = {
  SECOND: 60,
  MINUTE: 1,
  HOUR: 1 / 60,
  DAY: 1 / 1440
};
var name = msg.h.asset_name;

function toJoin(text) {
  msg.payload = {
    assetId: msg.asset.id,
    name: name,
    failed: text,
    skipped: null,
    planRows: [],
    utilRows: [],
    lossRows: []
  };
  delete msg.hours;
  delete msg.kpiMeta;
  delete msg.shiftRules;
  return [null, null, msg];
}

// Parts per minute of a product, null when the interval is not known.
function perMinute(p) {
  var factor = MIN_PER[String(p.designSpeedInterval).toUpperCase()];
  var value = Number(p.designSpeedValue);
  if (factor === undefined || !isFinite(value) || p.designSpeedValue === null) {
    return null;
  }
  return value * factor;
}

// Step 1: keep the master data of the products that ran that day.
var wanted = msg.values.products;
msg.productList = [];
if (msg.productsCalled) {
  var body = msg.payload;
  if (msg.statusCode !== 200 || !body || typeof body !== 'object') {
    return toJoin(name + ': product list failed, HTTP ' + msg.statusCode);
  }
  var all = Array.isArray(body) ? body : body.products || [];
  all.forEach(function (p) {
    if (wanted.indexOf(String(p.name)) < 0) {
      return;
    }
    msg.productList.push({
      name: String(p.name),
      code: p.code ? String(p.code) : null,
      description: p.description ? String(p.description) : null,
      perMinute: perMinute(p)
    });
  });
}
delete msg.payload;
delete msg.productsCalled;

// Step 2: one job per product and per order.
var jobs = [];
msg.values.products.forEach(function (v) {
  jobs.push({ key: 'PRODUCT', value: v });
});
msg.values.orders.forEach(function (v) {
  jobs.push({ key: 'ORDER', value: v });
});
if (!jobs.length) {
  return [null, msg, null];
}

// Step 3: forget runs that never finished, then clone one message per job.
var now = Date.now();
var runs = flow.get('valueRuns') || {};
Object.keys(runs).forEach(function (k) {
  if (now - runs[k].created > STALE_MS) {
    delete runs[k];
  }
});
flow.set('valueRuns', runs);
var run = msg.asset.id + '|' + msg.day + '|' + now + '|';
run += Math.floor(Math.random() * 1000000);
var out = jobs.map(function (job) {
  var copy = JSON.parse(JSON.stringify(msg));
  copy.job = job;
  copy.jobRun = run;
  copy.jobCount = jobs.length;
  return copy;
});
return [out, null, null];
