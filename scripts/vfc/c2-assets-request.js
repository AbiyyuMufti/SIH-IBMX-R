// Keeps the token and builds the OEE asset list request.
// In: the token response. Out: the request for the http node.
// A failed token request stops here with a red status.
var cfg = flow.get('cfg');
var token = msg.payload && msg.payload.access_token;
if (msg.statusCode !== 200 || !token) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'token failed, HTTP ' + msg.statusCode
  });
  node.error('asset list: token request failed, HTTP ' + msg.statusCode);
  return null;
}
msg.token = token;
msg.method = 'GET';
msg.url = cfg.oeeBase + '/assets';
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
delete msg.payload;
return msg;
