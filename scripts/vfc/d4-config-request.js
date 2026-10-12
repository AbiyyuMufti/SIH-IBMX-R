// Builds the OEE config request of one asset (to get its calendar id).
// In: msg.asset and msg.token, after the KPI steps. msg.hours is kept.
// Out: msg.method, msg.url and msg.headers for the http request node.
var cfg = flow.get('cfg');
msg.method = 'GET';
msg.url = cfg.gateway + '/api/oee/v3/assets/' +
  encodeURIComponent(msg.asset.id) + '/config';
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
delete msg.payload;
return msg;
