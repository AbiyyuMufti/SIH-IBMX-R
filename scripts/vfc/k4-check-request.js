// Checks the request of the lake API (GET ?path=<file> or ?list=<folder>).
// In: msg.req.query.path = a .parquet file, or query.list = a folder.
// Out 1: msg.mode, msg.folder and msg.key for the list step.
// Out 2: a 400 answer. It also gives the log lanes the root folder.
var REQUIRED_ENDING = '.parquet';

var query = (msg.req && msg.req.query) || {};
var path = String(query.path || '');
var list = String(query.list || '');
var target = path || list;

var problem = '';
if (path && list) {
  problem = 'use path or list, not both';
} else if (!target) {
  problem = 'query parameter path or list is missing';
} else if (target.indexOf('..') !== -1 || target.indexOf('\\') !== -1) {
  problem = 'the path must not contain .. or a backslash';
} else if (target.charAt(0) === '/') {
  problem = 'the path must not start with /';
} else if (path && path.slice(-REQUIRED_ENDING.length) !== REQUIRED_ENDING) {
  problem = 'only ' + REQUIRED_ENDING + ' files can be requested';
} else if (list && list.slice(-1) !== '/') {
  problem = 'a folder must end with /';
}

// The log lanes read the root folder of the data lake from here.
var shared = glob.get('cfg');
if (shared && shared.root) {
  flow.set('cfg', {
    root: shared.root
  });
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

msg.mode = path ? 'file' : 'list';
msg.key = path;
msg.folder = list || path.slice(0, path.lastIndexOf('/') + 1);
msg.path = msg.folder;
node.status({
  fill: 'green',
  shape: 'dot',
  text: msg.mode + ' ' + target
});
return [msg, null];
