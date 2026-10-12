// Turns the read result into the HTTP answer with the parquet file.
// In: msg.payload = file content (Buffer or serialised Buffer).
// Out: the file as bytes. 502 if the bytes do not start with PAR1.
// Header x-parquet-magic tells if the first 4 bytes are PAR1.
var MAGIC = 'PAR1';

var content = msg.payload;
var bytes = null;
if (Buffer.isBuffer(content)) {
  bytes = content;
} else if (content && content.type === 'Buffer' && content.data) {
  bytes = Buffer.from(content.data);
}

var magic = false;
if (bytes) {
  magic = bytes.slice(0, 4).toString('latin1') === MAGIC;
}

if (!magic) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'not a parquet file'
  });
  msg.statusCode = 502;
  msg.headers = {
    'content-type': 'application/json'
  };
  msg.payload = {
    error: 'the data lake did not return a parquet file',
    path: msg.path
  };
  return msg;
}

var name = String(msg.path).split('/').pop();
node.status({
  fill: 'green',
  shape: 'dot',
  text: bytes.length + ' bytes'
});
msg.statusCode = 200;
msg.size = bytes.length;
msg.headers = {
  'content-type': 'application/octet-stream',
  'content-disposition': 'attachment; filename="' + name + '"',
  'x-parquet-magic': 'ok',
  'x-file-size': String(bytes.length)
};
msg.payload = bytes;
return msg;
