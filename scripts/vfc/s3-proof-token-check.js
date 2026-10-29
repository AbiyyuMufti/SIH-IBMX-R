// Checks and retains the Insights Hub token for the proof.
// In: token HTTP response. Out: the same message for Graph listing.
var token = msg.payload && msg.payload.access_token;

if (msg.statusCode !== 200 || !token) {
  msg.proofFailureReason = 'Insights Hub token HTTP ' + msg.statusCode;
  node.error(msg.proofFailureReason, msg);
  return null;
}

msg.lakeToken = token;
delete msg.payload;
msg._proofStage = 'SharePoint listing';
node.status({ fill: 'blue', shape: 'dot', text: 'building Graph request' });
return msg;
