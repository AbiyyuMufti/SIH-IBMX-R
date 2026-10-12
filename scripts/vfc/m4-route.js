// Splits the asset bundles into one message per table.
// In: msg.payload = array of {machine, calendar}.
// Out 1: the machine items. Out 2: the calendar items (for the shift names).
var KEYS = [
  'machine',
  'calendar'
];
var bundles = msg.payload;

function messageFor(key) {
  var copy = Object.assign({}, msg);
  copy.payload = bundles.map(function (bundle) {
    return bundle[key];
  });
  return copy;
}

node.status({
  fill: 'blue',
  shape: 'dot',
  text: bundles.length + ' asset(s)'
});
return KEYS.map(messageFor);
