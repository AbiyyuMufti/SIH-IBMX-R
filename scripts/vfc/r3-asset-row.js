// Builds the dim_asset item (one row) of one asset.
// In: msg.h (hierarchy), msg.configInfo and msg.asset. An unconfigured
// asset is kept, with empty ids. Out: msg.dimItem = {name, failed, skipped,
// rows}.
var asset = msg.asset;
var info = msg.configInfo || {};
var item = {
  name: asset.name,
  failed: null,
  skipped: null,
  rows: []
};

var isManual = null;
if (asset.isManual !== null && asset.isManual !== undefined) {
  isManual = !!asset.isManual;
}

if (msg.amFail) {
  item.failed = msg.amFail;
} else if (msg.skip === 'excluded') {
  item.skipped = asset.name + ' excluded';
} else if (asset.isConfigured && info.status !== 200) {
  var text = asset.name + ': asset config failed, HTTP ';
  item.failed = text + info.status;
} else {
  item.rows.push({
    asset_id: asset.id,
    asset_name: msg.h.asset_name,
    site: msg.h.site,
    area: msg.h.area,
    line: msg.h.line,
    machine: msg.h.machine,
    is_manual: isManual,
    is_configured: asset.isConfigured,
    calendar_id: info.calendarId || null,
    product_collection_id: info.productCollectionId || null,
    reason_tree_id: asset.reasonTreeId,
    loaded_at: msg.loadedAt
  });
}
msg.dimItem = item;
return msg;
