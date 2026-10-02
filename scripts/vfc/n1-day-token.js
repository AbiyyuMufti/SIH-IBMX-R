// Step 1 of a day: ask for a token. The next node is an http request node (it uses msg.method, msg.url, msg.headers).
var cfg = flow.get('cfg');
msg.day = msg.payload;
msg.loadedAt = Date.now();
msg.method = 'POST';
msg.url = 'https://' + cfg.tenantName + '.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials';
msg.headers = {
  'Authorization': 'Basic ' + Buffer.from(cfg.clientId + ':' + cfg.clientSecret).toString('base64'),
  'Accept': 'application/json'
};
delete msg.payload;
return msg;
