// Checks the evaluateKPIs response of one asset.
// In: the response. Out 1: the same message when it holds KPI results.
// Out 2: the asset result for the join when the call failed, the asset
// configuration is not finished or there is no data.
var name = msg.h.asset_name;
var body = msg.payload;

function toJoin(note) {
  msg.payload = {
    assetId: msg.asset.id,
    name: name,
    failed: note.failed || null,
    skipped: note.skipped || null,
    kpiRows: [],
    lossRows: []
  };
  return [null, msg];
}

var notFinished = msg.statusCode === 400 &&
  /configuration not finished/i.test(JSON.stringify(body));
if (notFinished) {
  return toJoin({ skipped: name + ' configuration not finished' });
}
if (msg.statusCode !== 200 || !body || typeof body !== 'object') {
  return toJoin({
    failed: name + ': evaluateKPIs failed, HTTP ' + msg.statusCode
  });
}
if (!body.results || !body.results.length) {
  return toJoin({ skipped: name + ' no data' });
}
return [msg, null];
