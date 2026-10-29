// Builds the unauthenticated PUT request for the signed lake URL.
// In: signed-URL response and file bytes. Out: a binary HTTP PUT request.
var body = msg.payload;
var signedUrl = body && body.objectUrls &&
  body.objectUrls[0] && body.objectUrls[0].signedUrl;
var bytes = msg.fileBytes;

if (bytes && bytes.type === 'Buffer' && Array.isArray(bytes.data)) {
  bytes = Buffer.from(bytes.data);
}

if (msg.statusCode !== 201 || !signedUrl) {
  msg.proofFailureReason = 'Lake signed URL HTTP ' + msg.statusCode;
  node.error(msg.proofFailureReason, msg);
  return null;
}
if (!Buffer.isBuffer(bytes)) {
  msg.proofFailureReason = 'Downloaded bytes are not a binary Buffer';
  node.error(msg.proofFailureReason, msg);
  return null;
}

msg.signedUrl = signedUrl;
msg.method = 'PUT';
msg.url = signedUrl;
msg.headers = {};
msg.payload = bytes;
delete msg.fileBytes;
msg._proofStage = 'lake file upload';
node.status({ fill: 'blue', shape: 'dot', text: 'uploading one file' });
return msg;
