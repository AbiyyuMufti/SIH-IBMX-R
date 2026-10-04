// Collects the asset results that the join delivered.
// In: msg.payload = array of asset results. Out: msg.kpiRows, msg.lossRows
// and msg.summary = {failed, notes, skipped, unmapped} (lists of text).
var results = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
var failed = [];
var notes = [];
var skipped = (msg.planSkipped || []).slice();
var unmapped = [];
var kpiRows = [];
var lossRows = [];

results.forEach(function (r) {
  if (!r) {
    return;
  }
  if (r.failed) {
    failed.push(r.failed);
  }
  if (r.skipped) {
    skipped.push(r.skipped);
  }
  if (r.note) {
    notes.push(r.note);
  }
  (r.unmapped || []).forEach(function (u) {
    if (unmapped.indexOf(u) < 0) {
      unmapped.push(u);
    }
  });
  kpiRows = kpiRows.concat(r.kpiRows || []);
  lossRows = lossRows.concat(r.lossRows || []);
});

msg.summary = {
  failed: failed,
  notes: notes,
  skipped: skipped,
  unmapped: unmapped
};
msg.kpiRows = kpiRows;
msg.lossRows = lossRows;
delete msg.payload;
delete msg.planSkipped;
return msg;
