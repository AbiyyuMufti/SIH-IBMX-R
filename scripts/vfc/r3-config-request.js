// Builds the OEE config request of one asset (calendar, product collection).
// In: one asset {id, name, ...} from the split node.
// Out: msg.method, msg.url and msg.headers for the http request node.
var cfg = flow.get('cfg');
msg.asset = msg.payload;
msg.method = 'GET';
msg.url = cfg.gateway + '/api/oee/v3/assets/' +
  encodeURIComponent(msg.asset.id) + '/config';
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
delete msg.payload;
return msg;
