// Collects the hours of every product and order of one asset and day.
// In: msg.payload = [{key, value, failed, hours}] from the join of 6.4.
// Out 1: the asset message with msg.valueHours. Out 2: the asset result
// for the day join when one of the calls failed.
var name = msg.h.asset_name;
var packs = Array.isArray(msg.payload) ? msg.payload : [];

// The day join gets its msg.parts back.
if (msg.assetParts === undefined) {
  delete msg.parts;
} else {
  msg.parts = msg.assetParts;
}
delete msg.assetParts;
delete msg.payload;

var hours = {
  PRODUCT: {},
  ORDER: {}
};
var failed = [];
packs.forEach(function (p) {
  if (p.failed) {
    failed.push(p.failed);
    return;
  }
  hours[p.key][p.value] = p.hours;
});

if (failed.length) {
  msg.payload = {
    assetId: msg.asset.id,
    name: name,
    failed: name + ': value KPIs failed, ' + failed[0],
    skipped: null,
    planRows: [],
    utilRows: [],
    lossRows: []
  };
  delete msg.hours;
  delete msg.kpiMeta;
  delete msg.shiftRules;
  return [null, msg];
}
msg.valueHours = hours;
return [msg, null];
