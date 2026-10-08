// Checks the request of the lake API spike (GET with ?path=...).
// In: msg.req.query.path = a .parquet file in the lake, query.format.
// Out 1: msg.path and msg.format for the read node. Out 2: an error answer.
var DEFAULT_FORMAT = 'bytes';
var ALLOWED_FORMATS = [
  'bytes',
  'base64'
];
var REQUIRED_ENDING = '.parquet';

var query = (msg.req && msg.req.query) || {};
var path = String(query.path || '');
var format = String(query.format || DEFAULT_FORMAT);

var problem = '';
if (!path) {
  problem = 'query parameter path is missing';
} else if (path.slice(-REQUIRED_ENDING.length) !== REQUIRED_ENDING) {
  problem = 'only ' + REQUIRED_ENDING + ' files can be requested';
} else if (path.indexOf('..') !== -1 || path.indexOf('\\') !== -1) {
  problem = 'the path must not contain .. or a backslash';
} else if (path.charAt(0) === '/') {
  problem = 'the path must not start with /';
} else if (ALLOWED_FORMATS.indexOf(format) === -1) {
  problem = 'format must be one of: ' + ALLOWED_FORMATS.join(', ');
}

if (problem) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: problem
  });
  msg.statusCode = 400;
  msg.headers = {
    'content-type': 'application/json'
  };
  msg.payload = {
    error: problem
  };
  return [null, msg];
}

node.status({
  fill: 'green',
  shape: 'dot',
  text: format + ' ' + path
});
msg.path = path;
msg.format = format;
return [msg, null];
