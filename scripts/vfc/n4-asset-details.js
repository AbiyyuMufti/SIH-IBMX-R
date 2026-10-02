// Step 4 (one message per asset, from the split node): ask Asset Management for the asset incl. hierarchyPath.
var cfg = flow.get('cfg');
msg.asset = msg.payload;   // { id, isManual, name }
msg.method = 'GET';
msg.url = cfg.gateway + '/api/assetmanagement/v3/assets/' + encodeURIComponent(msg.asset.id);
msg.headers = { 'Authorization': 'Bearer ' + msg.token, 'Accept': 'application/hal+json' };
delete msg.payload;
return msg;
