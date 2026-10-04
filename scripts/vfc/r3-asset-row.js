// Builds the dim_asset row of one asset.
// In: the OEE config response, msg.h (hierarchy) and msg.asset.
// Out: msg.payload = an item {name, failed, skipped, rows} for the join.
var asset = msg.asset;
var config = msg.payload || {};
var item = {
  name: asset.name,
  failed: null,
  skipped: null,
  rows: []
};

if (msg.statusCode !== 200) {
  // An asset that is not configured has no config: keep it, ids empty.
  config = {};
  if (asset.isConfigured) {
    var text = asset.name + ': asset config failed, HTTP ';
    item.failed = text + msg.statusCode;
    msg.payload = item;
    return msg;
  }
}

var isManual = null;
if (asset.isManual !== null && asset.isManual !== undefined) {
  isManual = !!asset.isManual;
}
item.rows.push({
  asset_id: asset.id,
  asset_name: msg.h.asset_name,
  site: msg.h.site,
  area: msg.h.area,
  line: msg.h.line,
  machine: msg.h.machine,
  is_manual: isManual,
  is_configured: asset.isConfigured,
  calendar_id: config.calendarId || null,
  product_collection_id: config.productCollectionId || null,
  reason_tree_id: asset.reasonTreeId,
  loaded_at: msg.loadedAt
});
msg.payload = item;
return msg;
