// Builds the token request. The next node is an http request node.
// In: a day message {payload: 'YYYY-MM-DD', mode}.
// Out: msg.method, msg.url, msg.headers (and a form body on xcelerator).
var cfg = flow.get('cfg');
var credentials = cfg.clientId + ':' + cfg.clientSecret;
msg.day = msg.payload;
msg.loadedAt = Date.now();
msg.method = 'POST';
msg.url = cfg.tokenUrl;
msg.headers = {
  'Authorization': 'Basic ' + Buffer.from(credentials).toString('base64'),
  'Accept': 'application/json'
};
if (cfg.tokenForm) {
  msg.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  msg.payload = 'grant_type=client_credentials';
} else {
  delete msg.payload;
}
return msg;
