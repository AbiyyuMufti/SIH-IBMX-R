// Builds the SharePoint folder listing request.
// In: settings and lake token. Out: a Graph HTTP request.
var folder = String(msg.proof.folder || '');
var segments = folder.split('/').filter(function (part) {
  return part.length > 0;
}).map(function (part) {
  return encodeURIComponent(part);
}).join('/');
var path = '/root/children';

if (segments) {
  path = '/root:/' + segments + ':/children';
}

msg.method = 'GET';
msg.url = 'https://graph.microsoft.com/v1.0/drives/';
msg.url += encodeURIComponent(msg.proof.driveId) + path;
msg.url += '?$top=200&$select=id,name,size,lastModifiedDateTime,file';
msg.headers = {
  'Authorization': 'Bearer ' + msg.proof.graphToken,
  'Accept': 'application/json'
};
msg._proofStage = 'SharePoint listing';
node.status({ fill: 'blue', shape: 'dot', text: 'listing SharePoint folder' });
return msg;
