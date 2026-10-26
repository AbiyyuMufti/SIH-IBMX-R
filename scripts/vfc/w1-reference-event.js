// Reads one event of the reference folder (subscribe object node).
// In: msg.payload = {eventType, path}. Out: msg.event = {kind, type, site}.
// Nothing is sent for a delete, another file type or a folder we do not use.
var TYPES = [
  'machine_names',
  'shift_naming',
  'glidepaths',
  'equipment_coding',
  'report_scope',
  'format_list'
];
// Path: .../reference/<type>/site=<Site>/<file>.csv
var PATTERN = /reference\/([a-z_]+)\/site=([^\/]+)\/[^\/]+\.csv$/i;

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
  text: parts[1] + ' ' + parts[2]
});
return {
  topic: 'event',
  event: {
    kind: 'reference',
    type: parts[1],
    site: parts[2]
  }
};
