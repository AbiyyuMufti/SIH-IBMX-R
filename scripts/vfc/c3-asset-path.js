// Shapes one asset with its place in the asset tree.
// In: the Asset Management answer for one asset (msg.asset from 2.x).
// Out: msg.payload = {id, name, names (root first), ancestorIds, isManual,
// failed}. The message keeps msg.parts, so the join collects all assets.
var asset = msg.asset;
var details = msg.payload;
var item = {
  id: asset.id,
  name: asset.name,
  names: [],
  ancestorIds: [],
  isManual: asset.isManual,
  failed: null
};
if (msg.statusCode !== 200 || !details || !details.name) {
  item.failed = 'asset details failed, HTTP ' + msg.statusCode;
} else {
  (details.hierarchyPath || []).forEach(function (step) {
    item.names.push(step.name);
    item.ancestorIds.push(step.assetId);
  });
  item.names.push(details.name);
  item.name = details.name;
}
msg.payload = item;
return msg;
