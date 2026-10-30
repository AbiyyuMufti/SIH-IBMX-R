// Reports the stored file without exposing keys, tokens or signed URLs.
// In: signed PUT response. Out: a short debug message.
if (msg.statusCode !== 200) {
  msg.proofFailureReason = 'Lake PUT HTTP ' + msg.statusCode;
  node.error(msg.proofFailureReason, msg);
  return null;
}

var text = 'UPLOADED ' + msg.proofFile.name;
text += ' (' + msg.rowCount + ' rows, ' + msg.fileSize + ' bytes) to ';
text += msg.lakePath;
msg.payload = text;
delete msg.proof;
delete msg.lakeToken;
delete msg.signedUrl;
delete msg.url;
delete msg.headers;
delete msg.method;
delete msg.fileBytes;
delete msg._proofStage;
node.status({ fill: 'green', shape: 'dot', text: 'lake upload complete' });
return msg;
