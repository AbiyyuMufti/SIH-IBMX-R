
// ===== Step 6 (per asset): build the KPI rows from the response, then the downtimeReasons request. Output 2 = straight to the join =====
var cfg = flow.get('cfg');
var nm = msg.h.asset_name;
function toJoin(note) {
  msg.payload = { assetId: msg.asset.id, name: nm, failed: note.failed || null, skipped: note.skipped || null, kpiRows: [], lossRows: [] };
  return [null, msg];
}
var body = msg.payload;
if (msg.statusCode === 400 && /configuration not finished/i.test(JSON.stringify(body))) return toJoin({ skipped: nm + ' configuration not finished' });
if (msg.statusCode !== 200 || !body || typeof body !== 'object') return toJoin({ failed: nm + ': evaluateKPIs failed, HTTP ' + msg.statusCode });
if (!body.results || !body.results.length) return toJoin({ skipped: nm + ' no data' });
var unmapped = [];
msg.kpiRows = buildKpiRows(body, { assetId: msg.asset.id, isManual: msg.asset.isManual, h: msg.h, loadMode: msg.mode, loadedAt: msg.loadedAt || Date.now(), unmapped: unmapped });
msg.unmapped = unmapped;
var fromIso = new Date(Date.parse(msg.day + 'T06:00:00.000Z')).toISOString();
var toIso = new Date(Date.parse(msg.day + 'T06:00:00.000Z') + 86400000).toISOString();
msg.method = 'GET';
// size 5000 returns every stop of a day in one page (tested: 423 stops with size 1000). More than one page makes the day fail.
msg.url = cfg.gateway + '/api/oee/v3/assets/' + encodeURIComponent(msg.asset.id) + '/downtimeReasons?from=' + encodeURIComponent(fromIso) + '&to=' + encodeURIComponent(toIso) + '&size=5000&page=0';
msg.headers = { 'Authorization': 'Bearer ' + msg.token, 'Accept': 'application/json' };
delete msg.payload;
return [msg, null];
