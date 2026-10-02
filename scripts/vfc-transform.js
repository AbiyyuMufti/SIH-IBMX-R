// Transformation logic for the VFC flow (fact_kpi, fact_loss). Pure functions, no imports, no
// network, so the same text can be pasted into a VFC function node and tested locally here.
// ES5-style on purpose (var, function) in case the VFC function sandbox is old.

var KPI_COLUMNS = {
  'Good parts': 'good_parts', 'Total parts': 'total_parts', 'Rejected parts': 'rejected_parts',
  'Connected rejected parts': 'connected_rejected_parts', 'Manual rejected parts': 'manual_rejected_parts',
  'Theoretical output': 'theoretical_output',
  'Quality': 'quality', 'Performance': 'performance', 'Availability': 'availability', 'OEE': 'oee', 'TEEP': 'teep',
  'Total time': 'total_time_ms', 'Planned stops': 'planned_stops_ms', 'Planned stop from shift plan': 'planned_stop_shift_plan_ms',
  'Operational time': 'operational_time_ms', 'Net production time': 'net_production_time_ms',
  'Net operational time': 'net_operational_time_ms', 'Used operational time': 'used_operational_time_ms',
  'Availability losses': 'availability_losses_ms', 'Availability loss (occurrence)': 'availability_loss_count',
  'Performance losses': 'performance_losses_ms', 'Quality losses': 'quality_losses_ms',
  'MTTR': 'mttr_ms', 'MTBF': 'mtbf_ms',
  'Downtime (duration)': 'downtime_ms', 'Downtimes (occurrence)': 'downtime_count',
  'Micro stops (duration)': 'micro_stops_ms', 'Micro stops (occurrence)': 'micro_stops_count',
  'Macro stops (duration)': 'macro_stops_ms', 'Macro stops (occurrence)': 'macro_stops_count'
};
// Columns that showed fractional values in real data (GT4 manual counts, B2 Line derived times): written as DOUBLE, never rounded.
var DOUBLE_COLUMNS = ['good_parts', 'total_parts', 'rejected_parts', 'connected_rejected_parts', 'manual_rejected_parts', 'theoretical_output',
  'used_operational_time_ms', 'net_operational_time_ms', 'performance_losses_ms', 'quality_losses_ms', 'mttr_ms', 'mtbf_ms',
  'availability_loss_count', 'downtime_count', 'macro_stops_count'];
// Remaining count and millisecond columns: INT64 (rounded).
var INT_COLUMNS = ['total_time_ms', 'planned_stops_ms', 'planned_stop_shift_plan_ms', 'operational_time_ms', 'net_production_time_ms',
  'availability_losses_ms', 'micro_stops_ms', 'micro_stops_count', 'macro_stops_ms'];
// The parquet node has no DATE type: days are written as ISO text YYYY-MM-DD (STRING).
function dateObj(s) { return s; }

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}
// Europe/London offset in hours for a UTC instant (BST = last Sunday March 01:00 UTC to last Sunday October 01:00 UTC)
function lastSundayUtc(year, month) {
  var d = new Date(Date.UTC(year, month + 1, 0, 1, 0, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}
function londonOffsetHours(ms) {
  var y = new Date(ms).getUTCFullYear();
  return ms >= lastSundayUtc(y, 2) && ms < lastSundayUtc(y, 9) ? 1 : 0;
}
function roundOrNull(v) { var n = numOrNull(v); return n === null ? null : Math.round(n); }
function ymd(ms) { return new Date(ms).toISOString().slice(0, 10); }
function productionDay(ms) { return ymd(ms - 6 * 3600000); }
function londonDate(ms) { return ymd(ms + londonOffsetHours(ms) * 3600000); }

// Hierarchy from Asset Management GET /assets/{id}: names = hierarchyPath names (root first) + the asset's own name.
// Tenant layout (checked): [0] tenant, [1] region (EU/NA), [2] site, [3] area, [4] line, [5] machine.
// B2 Line = [reckitt, EU, Hull, Bottles, B2 Line]; GT4 = [reckitt, EU, Hull, Blisters, GT4] (GT4 has no machine, so it is the line).
function hierarchyFromNames(names) {
  return {
    asset_name: names[names.length - 1] || null,
    site: names[2] || null, area: names[3] || null, line: names[4] || null, machine: names[5] || null
  };
}

// evaluateKPIs response body (groupedByDateTime true, recursive false) -> fact_kpi rows (one per hour)
function buildKpiRows(body, ctx) {
  // ctx: {assetId, isManual, h (hierarchy fields), loadMode, loadedAt (ms), unmapped (array to collect)}
  var results = (body && body.results) || [];
  var hours = {}, order = [];
  results.forEach(function (r) {
    var col = KPI_COLUMNS[r.name];
    if (!col) { if (ctx.unmapped && ctx.unmapped.indexOf(r.name) < 0) ctx.unmapped.push(r.name); return; }
    (r.groups || []).forEach(function (g) {
      if (!hours[g.time]) { hours[g.time] = {}; order.push(g.time); }
      hours[g.time][col] = numOrNull(g.value);
    });
  });
  var miss = body && body.missingMapping && body.missingMapping.length ? JSON.stringify(body.missingMapping) : null;
  return order.sort().map(function (t) {
    var ms = Date.parse(t), v = hours[t];
    var row = {
      asset_id: ctx.assetId, asset_name: ctx.h.asset_name, site: ctx.h.site, area: ctx.h.area, line: ctx.h.line, machine: ctx.h.machine,
      is_manual: ctx.isManual === null || ctx.isManual === undefined ? null : !!ctx.isManual,
      product_unit: (body && body.productUnit) || null,
      period_start: new Date(ms), period_end: new Date(ms + 3600000),
      production_day: dateObj(productionDay(ms)), local_date: dateObj(londonDate(ms))
    };
    ['oee', 'teep', 'availability', 'performance', 'quality'].forEach(function (c) { row[c] = v[c] === undefined ? null : v[c]; });
    Object.keys(KPI_COLUMNS).forEach(function (k) {
      var c = KPI_COLUMNS[k];
      if (row.hasOwnProperty(c)) return;
      var x = v[c] === undefined ? null : v[c];
      row[c] = x !== null && INT_COLUMNS.indexOf(c) >= 0 ? Math.round(x) : x;
    });
    row.missing_mapping = miss;
    row.load_mode = ctx.loadMode;
    row.loaded_at = new Date(ctx.loadedAt);
    return row;
  });
}

// loss class from the root of the reason path. plannedRoots comes from the config node.
function lossClass(row, plannedRoots) {
  if (row.reason === '##MICROSTOPS##') return 'microstop';
  var root = String(row.reasonFullPath || row.reason || '').split(' / ')[0];
  return plannedRoots.indexOf(root) >= 0 ? 'planned' : 'unplanned';
}

// downtimeReasons rows (all pages) -> fact_loss rows. Keeps rows whose start lies in [fromMs, toMs).
function buildLossRows(rows, ctx) {
  // ctx: {assetId, h, fromMs, toMs, plannedRoots, loadMode, loadedAt}
  var out = [], dropped = 0;
  (rows || []).forEach(function (r) {
    var s = Date.parse(r.from);
    if (!(s >= ctx.fromMs && s < ctx.toMs)) { dropped++; return; }
    var parts = r.reasonFullPath ? String(r.reasonFullPath).split(' / ') : [];
    out.push({
      asset_id: ctx.assetId, asset_name: ctx.h.asset_name, site: ctx.h.site, area: ctx.h.area, line: ctx.h.line, machine: ctx.h.machine,
      event_start: new Date(s), event_end: r.to ? new Date(Date.parse(r.to)) : null,
      production_day: dateObj(productionDay(s)), local_date: dateObj(londonDate(s)),
      reason: r.reason || null,
      reason_category: parts.length > 1 ? parts[0] : null,
      reason_subgroup: parts.length > 2 ? parts[1] : null,
      reason_full_path: r.reasonFullPath || null,
      loss_class: lossClass(r, ctx.plannedRoots),
      is_microstop: r.reason === '##MICROSTOPS##',
      duration_ms: roundOrNull(r.duration), loss_time_ms: roundOrNull(r.lossTime),
      occurrence: numOrNull(r.occurrence), comment_count: numOrNull(r.commentCount),
      overwritten: r.overwritten === null || r.overwritten === undefined ? null : !!r.overwritten,
      load_mode: ctx.loadMode, loaded_at: new Date(ctx.loadedAt)
    });
  });
  out.droppedOutsideWindow = dropped;
  return out;
}

if (typeof module !== 'undefined') module.exports = { KPI_COLUMNS: KPI_COLUMNS, INT_COLUMNS: INT_COLUMNS, DOUBLE_COLUMNS: DOUBLE_COLUMNS, hierarchyFromNames: hierarchyFromNames, buildKpiRows: buildKpiRows, buildLossRows: buildLossRows, productionDay: productionDay, londonDate: londonDate, londonOffsetHours: londonOffsetHours };
