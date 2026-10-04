// Builds the ref_target_seed rows (one per KPI) of one asset.
// In: the OEE asset response with thresholds. Out: msg.payload = an item
// {name, failed, skipped, rows} for the join. is_set = a value above 0.
var KPI_NAMES = [
  'OEE',
  'Availability',
  'Performance',
  'Quality'
];
var asset = msg.asset;
var body = msg.payload || {};
var item = {
  name: asset.name,
  failed: null,
  skipped: null,
  rows: []
};

function valueOf(list, kpi) {
  var found = null;
  (list || []).forEach(function (entry) {
    if (entry.name === kpi && typeof entry.value === 'number') {
      found = entry.value;
    }
  });
  return found;
}

if (msg.statusCode !== 200 || !body.thresholds) {
  var text = asset.name + ': thresholds failed, HTTP ';
  item.failed = text + msg.statusCode;
  msg.payload = item;
  return msg;
}

KPI_NAMES.forEach(function (kpi) {
  var warning = valueOf(body.thresholds.warnings, kpi);
  var error = valueOf(body.thresholds.errors, kpi);
  item.rows.push({
    asset_id: asset.id,
    asset_name: asset.name,
    kpi: kpi,
    warning: warning,
    error: error,
    is_set: warning > 0 || error > 0,
    loaded_at: msg.loadedAt
  });
});
msg.payload = item;
return msg;
