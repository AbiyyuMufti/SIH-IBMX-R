// Keeps the token and builds the OEE asset list request (isConfigured,
// isManual). In: the token response. Out 1: the request for the http node.
// Out 2: a log message when the token request failed.
var cfg = flow.get('cfg');
var token = msg.payload && msg.payload.access_token;

function logMessage(text) {
  return {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] ' + text
  };
}

if (msg.statusCode !== 200 || !token) {
  var failed = 'FAILED, NOTHING WRITTEN: token request failed, HTTP ';
  return [null, logMessage(failed + msg.statusCode)];
}
msg.token = token;
msg.method = 'GET';
msg.url = cfg.gateway + '/api/oee/v3/assets';
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
delete msg.payload;
return [msg, null];
