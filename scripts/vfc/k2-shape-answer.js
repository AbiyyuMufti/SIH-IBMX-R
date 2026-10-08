// Turns the read result into the HTTP answer of the lake API spike.
// In: msg.payload = file content (Buffer or serialised Buffer), msg.format.
// Out: bytes = the file itself, base64 = JSON with the file as text.
// Header x-parquet-magic tells if the first 4 bytes are PAR1.
var MAGIC = 'PAR1';

var content = msg.payload;
var bytes = null;
if (Buffer.isBuffer(content)) {
  bytes = content;
} else if (content && content.type === 'Buffer' && content.data) {
  bytes = Buffer.from(content.data);
}
if (!bytes) {
  node.error('the read node did not give bytes: ' + typeof content, msg);
  msg.statusCode = 500;
  msg.headers = {
    'content-type': 'application/json'
  };
  msg.payload = {
    error: 'the read node did not give bytes'
  };
  return msg;
}

var magic = bytes.slice(0, 4).toString('latin1') === MAGIC;
var name = String(msg.path).split('/').pop();
node.status({
  fill: magic ? 'green' : 'red',
  shape: 'dot',
  text: msg.format + ' ' + bytes.length + ' bytes'
});

msg.statusCode = 200;
msg.headers = {
  'x-parquet-magic': magic ? 'ok' : 'bad',
  'x-file-size': String(bytes.length)
};
if (msg.format === 'base64') {
  msg.headers['content-type'] = 'application/json';
  msg.payload = {
    path: msg.path,
    size: bytes.length,
    magic: magic,
    data: bytes.toString('base64')
  };
  return msg;
}

msg.headers['content-type'] = 'application/octet-stream';
msg.headers['content-disposition'] = 'attachment; filename="' + name + '"';
msg.payload = bytes;
return msg;
