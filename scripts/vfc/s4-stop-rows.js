// Builds the fact_loss rows of one asset from the stops of the day.
// In: msg.stops and msg.h. Out: msg.lossRows and msg.droppedStops (stops
// that start outside the production day). The day columns are added later.
var cfg = flow.get('cfg');
var DAY_MS = 86400000;
// A production day D runs from D 06:00Z to D+1 06:00Z.
var DAY_START = 'T06:00:00.000Z';
var MICROSTOPS = '##MICROSTOPS##';
var loadedAt = msg.loadedAt || Date.now();
var fromMs = Date.parse(msg.day + DAY_START);
var toMs = fromMs + DAY_MS;

function numOrNull(v) {
  if (v === null || v === undefined || v === '') {
    return null;
  }
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function roundOrNull(v) {
  var n = numOrNull(v);
  return n === null ? null : Math.round(n);
}

// The first part of the reason path decides: planned or unplanned.
function lossClass(stop) {
  if (stop.reason === MICROSTOPS) {
    return 'microstop';
  }
  var path = String(stop.reasonFullPath || stop.reason || '');
  var root = path.split(' / ')[0];
  return cfg.plannedRoots.indexOf(root) >= 0 ? 'planned' : 'unplanned';
}

// Only stops that start inside the production day are kept.
var lossRows = [];
var dropped = 0;
msg.stops.forEach(function (r) {
  var start = Date.parse(r.from);
  if (!(start >= fromMs && start < toMs)) {
    dropped++;
    return;
  }
  var parts = r.reasonFullPath ? String(r.reasonFullPath).split(' / ') : [];
  var overwritten = null;
  if (r.overwritten !== null && r.overwritten !== undefined) {
    overwritten = !!r.overwritten;
  }
  lossRows.push({
    asset_id: msg.asset.id,
    asset_name: msg.h.asset_name,
    site: msg.h.site,
    area: msg.h.area,
    line: msg.h.line,
    machine: msg.h.machine,
    event_start: new Date(start),
    event_end: r.to ? new Date(Date.parse(r.to)) : null,
    reason: r.reason || null,
    reason_category: parts.length > 1 ? parts[0] : null,
    reason_subgroup: parts.length > 2 ? parts[1] : null,
    reason_full_path: r.reasonFullPath || null,
    loss_class: lossClass(r),
    is_microstop: r.reason === MICROSTOPS,
    duration_ms: roundOrNull(r.duration),
    loss_time_ms: roundOrNull(r.lossTime),
    occurrence: numOrNull(r.occurrence),
    comment_count: numOrNull(r.commentCount),
    overwritten: overwritten,
    load_mode: msg.mode,
    loaded_at: new Date(loadedAt)
  });
});

msg.lossRows = lossRows;
msg.droppedStops = dropped;
delete msg.stops;
return msg;
