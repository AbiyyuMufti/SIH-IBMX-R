// Reads the filterValues answer and asks for the product list.
// In: the filterValues response. Out 1: the product list request. Out 2:
// no product collection, go on. Out 3: no product or order that day.
// Out 4: the asset result for the join when the call failed.
var cfg = flow.get('cfg');
var name = msg.h.asset_name;
// More values than this in one day fail the asset (one KPI call each).
var MAX_VALUES = 30;

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
  return [null, null, null, msg];
}

// The values of one filter key, text only, every value once.
function valuesOf(list, key) {
  var found = list.filter(function (f) {
    return f.key === key;
  })[0];
  var seen = [];
  ((found && found.value) || []).forEach(function (v) {
    var text = String(v);
    if (text !== '' && seen.indexOf(text) < 0) {
      seen.push(text);
    }
  });
  return seen;
}

var body = msg.payload;
if (msg.statusCode !== 200 || !body || typeof body !== 'object') {
  return toJoin(name + ': filterValues failed, HTTP ' + msg.statusCode);
}
var list = body.filterValues || [];
var products = valuesOf(list, 'product');
var orders = valuesOf(list, 'order');
if (products.length > MAX_VALUES || orders.length > MAX_VALUES) {
  return toJoin(name + ': more than ' + MAX_VALUES + ' products or orders');
}
msg.values = {
  products: products,
  orders: orders
};
delete msg.payload;
if (!products.length && !orders.length) {
  return [null, null, msg, null];
}
if (!msg.productCollectionId) {
  msg.productsCalled = false;
  return [null, msg, null, null];
}

msg.productsCalled = true;
var url = cfg.oeeBase + '/productCollections/';
url += encodeURIComponent(msg.productCollectionId) + '/products';
msg.method = 'GET';
msg.url = url;
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
return [msg, null, null, null];
