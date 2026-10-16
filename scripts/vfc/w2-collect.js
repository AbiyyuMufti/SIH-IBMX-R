// Collects the file events in flow context "pending", one entry per target
// (source: site and month, reference: type and site). Nothing is sent on:
// the release node sends the jobs when the wait window of an entry is over.
// Set LISTENERS_ON to false to drop all events (for example a bulk upload).
var LISTENERS_ON = true;

if (!LISTENERS_ON) {
  node.status({
    fill: 'grey',
    shape: 'ring',
    text: 'listeners OFF'
  });
  return null;
}

var event = msg.event;
var pending = flow.get('pending') || {};
var key = event.kind + '|' + event.site + '|';
key += event.kind === 'source' ? event.month : event.type;
var now = Date.now();

var entry = pending[key];
if (!entry) {
  entry = {
    kind: event.kind,
    site: event.site,
    month: event.month,
    type: event.kind === 'reference' ? event.type : null,
    types: {},
    first: now,
    events: 0
  };
}
entry.types[event.type] = true;
entry.events++;
pending[key] = entry;
flow.set('pending', pending);

node.status({
  fill: 'blue',
  shape: 'dot',
  text: Object.keys(pending).length + ' waiting'
});
return null;
