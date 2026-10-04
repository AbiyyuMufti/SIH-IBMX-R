// Builds the token request. The next node is an http request node.
// In: a day message {payload: 'YYYY-MM-DD', mode}.
// Out: msg.method, msg.url and msg.headers for the token POST.
var cfg = flow.get('cfg');
var credentials = cfg.clientId + ':' + cfg.clientSecret;
msg.day = msg.payload;
msg.loadedAt = Date.now();
msg.method = 'POST';
msg.url = 'https://' + cfg.tenantName +
  '.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials';
msg.headers = {
  'Authorization': 'Basic ' + Buffer.from(credentials).toString('base64'),
  'Accept': 'application/json'
};
delete msg.payload;
return msg;
