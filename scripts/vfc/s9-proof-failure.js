// Reports a sanitized proof failure.
// In: a caught error. Out: a short debug message without request details.
var stage = msg._proofStage || 'proof';
var reason = msg.proofFailureReason || 'request failed';
var name = msg.proofFile && msg.proofFile.name;
var text = 'FAILED ' + stage;

if (name) {
  text += ' ' + name;
}
text += ': ' + reason;
msg.payload = text;
delete msg.proof;
delete msg.lakeToken;
delete msg.signedUrl;
delete msg.url;
delete msg.headers;
delete msg.method;
delete msg.fileBytes;
delete msg._proofStage;
delete msg.proofFailureReason;
node.status({ fill: 'red', shape: 'ring', text: 'proof failed' });
return msg;
