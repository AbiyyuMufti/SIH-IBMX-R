// Builds the Asset Management request for one asset (to get hierarchyPath).
// In: one asset {id, isManual, name} from the split node.
// Out: msg.method, msg.url and msg.headers for the http request node.
var cfg = flow.get('cfg');
msg.asset = msg.payload;
msg.method = 'GET';
msg.url = cfg.gateway + '/api/assetmanagement/v3/assets/' +
  encodeURIComponent(msg.asset.id);
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/hal+json'
};
delete msg.payload;
return msg;
