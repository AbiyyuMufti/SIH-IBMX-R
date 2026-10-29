// Selects the configured small file and builds its content request.
// In: Graph folder response. Out: a Graph download HTTP request.
if (msg.statusCode !== 200 || !msg.payload ||
  !Array.isArray(msg.payload.value)) {
  msg.proofFailureReason = 'SharePoint listing HTTP ' + msg.statusCode;
  node.error(msg.proofFailureReason, msg);
  return null;
}

var items = msg.payload.value;
var file = null;
for (var i = 0; i < items.length; i++) {
  var item = items[i];
  if (!item || !item.file || !item.name) {
    continue;
  }
  if (item.name.startsWith('~$')) {
    continue;
  }
  if (item.name === msg.proof.fileName) {
    file = item;
    break;
  }
}

if (!file) {
  msg.proofFailureReason = 'Configured file not found on the first page';
  node.error(msg.proofFailureReason, msg);
  return null;
}

var size = Number(file.size);
if (!Number.isFinite(size) || size > msg.proof.maxFileBytes) {
  msg.proofFailureReason = 'File size is invalid or exceeds 5 MiB';
  node.error(msg.proofFailureReason, msg);
  return null;
}

msg.proofFile = {
  id: file.id,
  name: file.name,
  size: size
};
msg.proofPartialList = Boolean(msg.payload['@odata.nextLink']);
msg.method = 'GET';
msg.url = 'https://graph.microsoft.com/v1.0/drives/';
msg.url += encodeURIComponent(msg.proof.driveId);
msg.url += '/items/' + encodeURIComponent(file.id) + '/content';
msg.headers = {
  'Authorization': 'Bearer ' + msg.proof.graphToken,
  'Accept': '*/*'
};
msg._proofStage = 'SharePoint download';
delete msg.payload;
node.status({
  fill: 'blue',
  shape: 'dot',
  text: 'downloading configured file'
});
return msg;
