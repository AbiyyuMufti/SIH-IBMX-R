// Builds the id items for the product, calendar and reason tables.
// In: msg.asset, msg.amFail, msg.skip, msg.configInfo, msg.dimItem and
// msg.targetItem. Out: msg.payload = {dim, target, product, calendar,
// reason} for the join. An id item is {name, value, failed, skipped}.
var asset = msg.asset;
var info = msg.configInfo || {};
var configFailed = !msg.amFail && !msg.skip && info.status !== 200;

function idItem(value) {
  var item = {
    name: asset.name,
    value: null,
    failed: null,
    skipped: null
  };
  if (msg.amFail) {
    item.failed = msg.amFail;
  } else if (msg.skip) {
    item.skipped = asset.name + ' ' + msg.skip;
  } else {
    item.value = value || null;
  }
  return item;
}

function configItem(value) {
  var item = idItem(value);
  if (configFailed) {
    item.failed = asset.name + ': config failed, HTTP ' + info.status;
  }
  return item;
}

msg.payload = {
  dim: msg.dimItem,
  target: msg.targetItem,
  product: configItem(info.productCollectionId),
  calendar: configItem(info.calendarId),
  reason: idItem(asset.reasonTreeId)
};
delete msg.dimItem;
delete msg.targetItem;
return msg;
