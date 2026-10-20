// Turns the OEE asset list into one item per asset for the split node.
// In: the OEE asset list response. Out: msg.payload = [{id, name,
// isManual, isConfigured}]. A failed call stops here with a red status.
var list = msg.payload;
if (msg.statusCode !== 200 || !Array.isArray(list)) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'OEE asset list failed, HTTP ' + msg.statusCode
  });
  node.error('asset list: OEE asset list failed, HTTP ' + msg.statusCode);
  return null;
}
msg.payload = list.map(function (asset) {
  return {
    id: asset.assetId,
    name: asset.name,
    isManual: asset.isManual === true,
    isConfigured: asset.isConfigured === true
  };
});
node.status({
  fill: 'blue',
  shape: 'dot',
  text: msg.payload.length + ' OEE assets, one per second'
});
return msg;
