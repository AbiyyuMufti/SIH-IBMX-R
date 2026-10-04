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
// Short text of the API error (errors[0].message), else the raw body.
function apiMessage(payload) {
  var list = payload && (payload.errors ||
    (payload.data && payload.data.errors));
  if (list && list.length && list[0].message) {
    return String(list[0].message);
  }
  return JSON.stringify(payload).slice(0, 200);
}

if (msg.statusCode !== 200 || !body || typeof body !== 'object') {
  var why = msg.statusCode === 200 ? '' : ': ' + apiMessage(body);
  return failedResult(
    name + ': downtimeReasons failed, HTTP ' + msg.statusCode + why
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
