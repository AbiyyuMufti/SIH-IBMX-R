// Builds the fact_kpi rows (one per hour) of one asset.
// In: msg.hours, msg.kpiMeta and msg.h. Out: msg.kpiRows.
// The day columns (production_day, local_date) are added in stage 5.
var HOUR_MS = 3600000;
var loadedAt = msg.loadedAt || Date.now();
var isManual = null;
if (msg.asset.isManual !== null && msg.asset.isManual !== undefined) {
  isManual = !!msg.asset.isManual;
}

msg.kpiRows = msg.hours.map(function (hour) {
  var ms = Date.parse(hour.time);
  var row = {
    asset_id: msg.asset.id,
    asset_name: msg.h.asset_name,
    site: msg.h.site,
    area: msg.h.area,
    line: msg.h.line,
    machine: msg.h.machine,
    is_manual: isManual,
    product_unit: msg.kpiMeta.productUnit,
    period_start: new Date(ms),
    period_end: new Date(ms + HOUR_MS)
  };
  Object.keys(hour.values).forEach(function (c) {
    row[c] = hour.values[c];
  });
  row.missing_mapping = msg.kpiMeta.missingMapping;
  row.load_mode = msg.mode;
  row.loaded_at = new Date(loadedAt);
  return row;
});
delete msg.hours;
delete msg.kpiMeta;
return msg;
