
// ===== Step 7 (per asset): build the stop rows and hand one result per asset to the join =====
var cfg = flow.get('cfg');
var nm = msg.h.asset_name;
var res = { assetId: msg.asset.id, name: nm, failed: null, skipped: null, kpiRows: msg.kpiRows, lossRows: [], unmapped: msg.unmapped };
var b = msg.payload;
if (msg.statusCode !== 200 || !b || typeof b !== 'object') {
  res.failed = nm + ': downtimeReasons failed, HTTP ' + msg.statusCode;
  res.kpiRows = [];
} else if (b.page && b.page.totalPages > 1) {
  res.failed = nm + ': downtimeReasons has more than one page (' + b.page.totalElements + ' rows), raise the size in step 6';
  res.kpiRows = [];
} else {
  var fromMs = Date.parse(msg.day + 'T06:00:00.000Z');
  var rows = (b._embedded && b._embedded.downtimeReasons) || [];
  res.lossRows = buildLossRows(rows, { assetId: msg.asset.id, h: msg.h, fromMs: fromMs, toMs: fromMs + 86400000, plannedRoots: cfg.plannedRoots, loadMode: msg.mode, loadedAt: msg.loadedAt || Date.now() });
  res.outside = res.lossRows.droppedOutsideWindow;
  var sum = res.kpiRows.reduce(function (s, x) { return s + (x.total_time_ms || 0); }, 0);
  res.note = nm + ': ' + res.kpiRows.length + ' kpi rows, ' + res.lossRows.length + ' stops, sum total_time ' + (sum / 3600000).toFixed(2) + ' h' + (res.outside ? ', ' + res.outside + ' stops outside the day ignored' : '');
}
msg.payload = res;
delete msg.kpiRows; delete msg.unmapped;
return msg;
