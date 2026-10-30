// Requests a lake upload URL for the stored report text.
// In: lake token and file bytes. Out: an authenticated lake URL request.
var folder = String(msg.proof.lakeFolder || '');
folder = folder.replace(/^\/+|\/+$/g, '');
var name = msg.proofFile.name;
var validPath = /^[A-Za-z0-9 .!*'()_/-]+$/;

if (!folder || folder.indexOf('..') !== -1 ||
  folder.indexOf('data/ten=') === 0 || !validPath.test(folder) ||
  !/^[A-Za-z0-9 .!*'()_-]+$/.test(name)) {
  msg.proofFailureReason = 'Invalid lake path or file name';
  node.error(msg.proofFailureReason, msg);
  return null;
}

msg.lakePath = folder + '/' + name;
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
