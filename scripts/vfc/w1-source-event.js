// Reads one event of the source folder (subscribe object node).
// In: msg.payload = {eventType, path}. Out: msg.event = {kind, type, site,
// month}. Nothing is sent for a delete, another file type or another path.
var TYPES = [
  'plan_opt',
  'line_losses',
  'volume_loss_correction',
  'run_rates'
];
// Path: .../source/<type>/site=<Site>/<type>_<YYYY-MM>.csv
var PATTERN = /source\/([a-z_]+)\/site=([^\/]+)\/[a-z_]+_(\d{4}-\d{2})\.csv$/;

var event = msg.payload || {};
var path = String(event.path || msg.path || '');
var parts = PATTERN.exec(path);
if (event.eventType !== 'MODIFY' || !parts) {
  return null;
}
if (TYPES.indexOf(parts[1]) === -1) {
  return null;
}

node.status({
  fill: 'green',
  shape: 'dot',
  text: parts[2] + ' ' + parts[3] + ' ' + parts[1]
});
return {
  topic: 'event',
  event: {
    kind: 'source',
    type: parts[1],
    site: parts[2],
    month: parts[3]
  }
};
