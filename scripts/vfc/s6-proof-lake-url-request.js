// Checks the downloaded bytes and requests a lake upload URL.
// In: binary Graph response. Out: an authenticated lake URL request.
if (msg.statusCode !== 200) {
  msg.proofFailureReason = 'SharePoint download HTTP ' + msg.statusCode;
  node.error(msg.proofFailureReason, msg);
  return null;
}

var bytes = msg.payload;
if (bytes && bytes.type === 'Buffer' && Array.isArray(bytes.data)) {
  bytes = Buffer.from(bytes.data);
}
if (!Buffer.isBuffer(bytes)) {
  msg.proofFailureReason = 'Graph response was not a binary Buffer';
  node.error(msg.proofFailureReason, msg);
  return null;
}
if (bytes.length !== msg.proofFile.size) {
  msg.proofFailureReason = 'Downloaded byte count does not match SharePoint';
  node.error(msg.proofFailureReason, msg);
  return null;
}

var folder = String(msg.proof.lakeFolder || '');
folder = folder.replace(/^\/+|\/+$/g, '');
var validPath = /^[A-Za-z0-9 .!*'()_/-]+$/;
var name = msg.proofFile.name;
if (!folder || folder.indexOf('..') !== -1 ||
  folder.indexOf('data/ten=') === 0 || !validPath.test(folder) ||
  !/^[A-Za-z0-9 .!*'()_-]+$/.test(name)) {
  msg.proofFailureReason = 'Invalid lake path or file name';
  node.error(msg.proofFailureReason, msg);
  return null;
}

msg.fileBytes = bytes;
msg.fileSize = bytes.length;
msg.lakePath = folder + '/' + name;
if (msg.lakePath.length > 1024) {
  msg.proofFailureReason = 'Lake path exceeds 1024 characters';
  node.error(msg.proofFailureReason, msg);
  return null;
}
msg.method = 'POST';
msg.url = msg.lakeBase + '/generateUploadObjectUrls';
msg.headers = {
  'Authorization': 'Bearer ' + msg.lakeToken,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};
msg.payload = {
  paths: [
    { path: msg.lakePath }
  ]
};
msg._proofStage = 'lake signed URL';
node.status({
  fill: 'blue',
  shape: 'dot',
  text: 'requesting lake upload URL'
});
return msg;
