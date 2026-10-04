// Collects the items that the join delivered into one list of rows.
// In: msg.payload = array of items {name, failed, skipped, rows}.
// Out: msg.rows, msg.failed and msg.skipped (lists), msg.itemCount.
var items = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
var rows = [];
var failed = [];
var skipped = (msg.planSkipped || []).slice();

items.forEach(function (item) {
  if (!item) {
    return;
  }
  if (item.failed) {
    failed.push(item.failed);
  }
  if (item.skipped) {
    skipped.push(item.skipped);
  }
  rows = rows.concat(item.rows || []);
});
msg.rows = rows;
msg.failed = failed;
msg.skipped = skipped;
msg.itemCount = items.length;
delete msg.payload;
return msg;
