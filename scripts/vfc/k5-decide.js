// Decides what to do with the result of the list objects node.
// In: msg.payload = the objects of the folder, msg.mode (file or list).
// Out 1: file found, msg.path = the file for the read node.
// Out 2: the answer: the folder list as JSON, or 404 for a missing file.
var items = Array.isArray(msg.payload) ? msg.payload : [];

msg.headers = {
  'content-type': 'application/json'
};

if (msg.mode === 'list') {
  msg.statusCode = 200;
  msg.size = items.length;
  msg.payload = {
    folder: msg.folder,
    count: items.length,
    objects: items.map(function (item) {
      return {
        key: item.key,
        last_modified: item.lastModified,
        size: item.contentSize
      };
    })
  };
  return [null, msg];
}

var found = items.filter(function (item) {
  return item.key === msg.key;
})[0];

if (!found) {
  node.status({
    fill: 'yellow',
    shape: 'ring',
    text: 'not found, ' + items.length + ' listed'
  });
  msg.statusCode = 404;
  msg.payload = {
    error: 'file not found',
    path: msg.key,
    listed_in_folder: items.length
  };
  return [null, msg];
}

msg.path = found.key;
msg.size = found.contentSize;
return [msg, null];
