// Step 2 of a day: keep the token, ask for the OEE asset list (isConfigured, isManual). Output 2 = log (failure).
var cfg = flow.get('cfg');
if (msg.statusCode !== 200 || !msg.payload || !msg.payload.access_token) {
  return [null, { topic: 'log', payload: msg.day + ' [' + msg.mode + '] FAILED, NOTHING WRITTEN: token request failed, HTTP ' + msg.statusCode }];
}
msg.token = msg.payload.access_token;
msg.method = 'GET';
msg.url = cfg.gateway + '/api/oee/v3/assets';
msg.headers = { 'Authorization': 'Bearer ' + msg.token, 'Accept': 'application/json' };
delete msg.payload;
return [msg, null];
