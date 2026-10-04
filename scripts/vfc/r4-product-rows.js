// Builds the dim_product rows of one product collection.
// In: the products response and msg.target.
// Out: msg.payload = an item {name, failed, skipped, rows} for the join.
// design_speed_per_hour: the speed in units per hour, null if unknown.
var PER_HOUR = {
  SECOND: 3600,
  MINUTE: 60,
  HOUR: 1
};
var target = msg.target;
var label = target.name || String(target.id).slice(0, 6) + '...';
var item = {
  name: label,
  failed: null,
  skipped: null,
  rows: []
};

var products = msg.payload && msg.payload.products;
if (msg.statusCode !== 200 || !Array.isArray(products)) {
  var text = 'product collection ' + label + ' failed, HTTP ';
  item.failed = text + msg.statusCode;
  msg.payload = item;
  return msg;
}

function perHour(p) {
  var factor = PER_HOUR[p.designSpeedInterval];
  if (typeof p.designSpeedValue !== 'number' || !factor) {
    return null;
  }
  return p.designSpeedValue * factor;
}

products.forEach(function (p) {
  item.rows.push({
    collection_id: target.id,
    collection_name: target.name,
    product_id: p.id,
    code: p.code || null,
    name: p.name || null,
    description: p.description || null,
    design_speed_value: p.designSpeedValue,
    design_speed_unit: p.designSpeedUnit || null,
    design_speed_interval: p.designSpeedInterval || null,
    design_speed_type: p.designSpeedType || null,
    design_speed_per_hour: perHour(p),
    loaded_at: msg.loadedAt
  });
});
msg.payload = item;
return msg;
