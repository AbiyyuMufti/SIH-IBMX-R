// Checks the downtimeReasons response of one asset.
// In: the response. Out 1: msg.stops = the list of stops.
// Out 2: the asset result for the join when the call failed or has more
// than one page. The KPI rows of the asset are dropped then (no half days).
var name = msg.h.asset_name;

function failedResult(text) {
  msg.payload = {
    assetId: msg.asset.id,
    name: name,
    failed: text,
    skipped: null,
    kpiRows: [],
    lossRows: [],
    unmapped: msg.unmapped
  };
  delete msg.kpiRows;
  delete msg.unmapped;
  return [null, msg];
}

var body = msg.payload;
if (msg.statusCode !== 200 || !body || typeof body !== 'object') {
  return failedResult(
    name + ': downtimeReasons failed, HTTP ' + msg.statusCode
  );
}
if (body.page && body.page.totalPages > 1) {
  return failedResult(
    name + ': downtimeReasons has more than one page (' +
      body.page.totalElements + ' rows), raise PAGE_SIZE in node 4.1'
  );
}

msg.stops = (body._embedded && body._embedded.downtimeReasons) || [];
delete msg.payload;
return [msg, null];
