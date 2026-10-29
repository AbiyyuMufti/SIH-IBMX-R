// Builds the Insights Hub client-credentials request.
// In: proof settings. Out: an HTTP request for the lake token.
var cfg = glob.get('cfg');

if (!cfg || !cfg.clientId || !cfg.clientSecret || !cfg.tokenUrl) {
  msg.proofFailureReason = 'Insights Hub credentials are missing in Config';
  node.error(msg.proofFailureReason, msg);
  return null;
}

msg.method = 'POST';
msg.url = cfg.tokenUrl;
msg.headers = {
  'Authorization': 'Basic ' + Buffer.from(
    cfg.clientId + ':' + cfg.clientSecret
  ).toString('base64'),
  'Accept': 'application/json'
};
if (cfg.tokenForm) {
  msg.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  msg.payload = 'grant_type=client_credentials';
} else {
  delete msg.payload;
}
msg._proofStage = 'Insights Hub token';
node.status({ fill: 'blue', shape: 'dot', text: 'requesting lake token' });
return msg;
