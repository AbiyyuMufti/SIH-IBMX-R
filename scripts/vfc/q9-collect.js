// Collects the asset results that the join delivered.
// In: msg.payload = array of asset results. Out: msg.windowRows,
// msg.hourRows, msg.eventRows and msg.summary = {failed, notes, skipped,
// unmapped}.
var results = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
var failed = [];
var notes = [];
var skipped = (msg.planSkipped || []).slice();
var unmapped = [];
var windowRows = [];
var hourRows = [];
var eventRows = [];

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
  windowRows = windowRows.concat(r.windowRows || []);
  hourRows = hourRows.concat(r.hourRows || []);
  eventRows = eventRows.concat(r.eventRows || []);
});

msg.summary = {
  failed: failed,
  notes: notes,
  skipped: skipped,
  unmapped: unmapped
};
msg.windowRows = windowRows;
msg.hourRows = hourRows;
msg.eventRows = eventRows;
delete msg.payload;
delete msg.planSkipped;
return msg;
