// Builds the OEE request for the KPI targets (thresholds) of one asset.
// In: one asset {id, name, ...} from the split node.
// Out: msg.method, msg.url and msg.headers for the http request node.
var cfg = flow.get('cfg');
msg.asset = msg.payload;
msg.method = 'GET';
msg.url = cfg.gateway + '/api/oee/v3/assets/' +
  encodeURIComponent(msg.asset.id);
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
delete msg.payload;
return msg;
