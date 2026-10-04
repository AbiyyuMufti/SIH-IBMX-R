// Splits the asset bundles into one message per table.
// In: msg.payload = array of {dim, target, product, calendar, reason}.
// Out 1 to 5: the items for dim_asset, ref_target_seed, product collection
// ids, calendar ids and reason tree ids.
var KEYS = [
  'dim',
  'target',
  'product',
  'calendar',
  'reason'
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
