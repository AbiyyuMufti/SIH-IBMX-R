// Step 8 (after the join): one result per asset arrives as msg.payload (array). Build the two tables.
// Output 1 = fact_kpi rows, output 2 = fact_loss rows, output 3 = log. Any failed asset = nothing is written for the day.
var cfg = flow.get('cfg');
var day = msg.day, mode = msg.mode;
var results = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
var failed = results.filter(function (r) { return r && r.failed; }).map(function (r) { return r.failed; });
var kpiRows = [], lossRows = [], notes = [], skipped = (msg.planSkipped || []).slice(), unmapped = [];
results.forEach(function (r) {
  if (!r) return;
  if (r.skipped) skipped.push(r.skipped);
  if (r.note) notes.push(r.note);
  (r.unmapped || []).forEach(function (u) { if (unmapped.indexOf(u) < 0) unmapped.push(u); });
  kpiRows = kpiRows.concat(r.kpiRows || []);
  lossRows = lossRows.concat(r.lossRows || []);
});
var expected = msg.parts && msg.parts.count;
var tail = (skipped.length ? ' | skipped: ' + skipped.join('; ') : '') + (unmapped.length ? ' | KPI without column: ' + unmapped.join(', ') : '');
function log(text) { return { topic: 'log', payload: day + ' [' + mode + '] ' + text }; }
if (failed.length) {
  node.status({ fill: 'red', shape: 'ring', text: day + ' FAILED, nothing written' });
  return [null, null, log('FAILED, NOTHING WRITTEN: ' + failed.join(' | ') + tail)];
}
if (!kpiRows.length && !lossRows.length) {
  node.status({ fill: 'grey', shape: 'ring', text: day + ' nothing to write' });
  return [null, null, log(notes.join(' | ') + ' | NOTHING TO WRITE' + tail)];
}
if (cfg.dryRun) {
  node.status({ fill: 'yellow', shape: 'dot', text: day + ' dry run ' + kpiRows.length + '/' + lossRows.length });
  return [null, null, log(notes.join(' | ') + ' | DRY RUN: fact_kpi ' + kpiRows.length + ' rows, fact_loss ' + lossRows.length + ' rows. First rows: ' + JSON.stringify({ fact_kpi: kpiRows.slice(0, 2), fact_loss: lossRows.slice(0, 2) }) + tail)];
}
// parquet TIMESTAMP_MILLIS needs epoch ms, not Date objects or ISO text (messages are serialised between nodes, so Dates arrive as text)
function toMs(rows, keys) {
  return rows.map(function (r) {
    var o = Object.assign({}, r);
    keys.forEach(function (k) { if (o[k] !== null && o[k] !== undefined) o[k] = typeof o[k] === 'number' ? o[k] : Date.parse(o[k]); });
    return o;
  });
}
kpiRows = toMs(kpiRows, ['period_start', 'period_end', 'loaded_at']);
lossRows = toMs(lossRows, ['event_start', 'event_end', 'loaded_at']);
var kpiMsg = kpiRows.length ? { topic: 'fact_kpi', day: day, payload: kpiRows } : null;
var lossMsg = lossRows.length ? { topic: 'fact_loss', day: day, payload: lossRows } : null;
node.status({ fill: 'green', shape: 'dot', text: day + ' ' + kpiRows.length + '/' + lossRows.length });
return [kpiMsg, lossMsg, log(notes.join(' | ') + ' | WRITING fact_kpi ' + kpiRows.length + ' rows, fact_loss ' + lossRows.length + ' rows' + tail)];
