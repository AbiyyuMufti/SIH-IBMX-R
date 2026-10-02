
// ===== Step 5 (per asset): hierarchy from hierarchyPath, then the KPI request. Output 1 = KPI request, output 2 = straight to the join =====
var cfg = flow.get('cfg');
function toJoin(note) {
  msg.payload = { assetId: msg.asset.id, name: msg.asset.name, failed: note.failed || null, skipped: note.skipped || null, kpiRows: [], lossRows: [] };
  return [null, msg];
}
if (msg.statusCode !== 200 || !msg.payload || !msg.payload.name) return toJoin({ failed: msg.asset.name + ': asset details failed, HTTP ' + msg.statusCode });
var names = (msg.payload.hierarchyPath || []).map(function (p) { return p.name; });
names.push(msg.payload.name);
var h = hierarchyFromNames(names);
msg.h = h;
var parents = names.slice(0, -1);
var excluded = cfg.excludeNames.indexOf(msg.payload.name) >= 0 || parents.some(function (n) { return cfg.excludeAncestorNames.indexOf(n) >= 0; });
if (excluded) return toJoin({ skipped: h.asset_name + ' excluded' });
msg.method = 'POST';
msg.url = cfg.gateway + '/api/oee/v3/expressions/evaluateKPIs';
msg.headers = { 'Authorization': 'Bearer ' + msg.token, 'Content-Type': 'application/json', 'Accept': 'application/json' };
msg.payload = {
  assetId: msg.asset.id,
  scope: {
    from: new Date(Date.parse(msg.day + 'T06:00:00.000Z')).toISOString(),
    to: new Date(Date.parse(msg.day + 'T06:00:00.000Z') + 86400000).toISOString(),
    filter: [{ key: 'PRODUCT', value: [] }],
    recursive: false,
    groupedByDateTime: true
  }
};
return [msg, null];
