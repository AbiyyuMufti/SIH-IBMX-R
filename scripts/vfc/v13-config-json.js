// Answers view=config: the settings of 1.1 CONFIG without the credentials,
// and the rules of the report scope file. In: msg.payload = parsed scope
// rows (empty when msg.scopeMissing). Out: the JSON response.
var HIDDEN = [
  'clientId',
  'clientSecret'
];
var SCOPE_COLUMNS = [
  'Site',
  'Tables',
  'Rule',
  'Column',
  'Value',
  'Why'
];

var cfg = glob.get('cfg') || {};
var settings = {};
Object.keys(cfg).forEach(function (name) {
  if (HIDDEN.indexOf(name) === -1) {
    settings[name] = cfg[name];
  }
});

// The csv node leaves empty cells out; a byte order mark can sit in the
// first column name.
function cell(row, name) {
  var value = row[name];
  if (value === undefined && name === 'Site') {
    value = row['\uFEFFSite'];
  }
  return value === undefined || value === null ? '' : String(value);
}

var rows = Array.isArray(msg.payload) ? msg.payload : [];
var rules = rows.map(function (row) {
  var rule = {};
  SCOPE_COLUMNS.forEach(function (name) {
    rule[name] = cell(row, name);
  });
  return rule;
});

msg.statusCode = 200;
msg.headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};
msg.payload = {
  generatedAt: new Date().toISOString(),
  hidden: HIDDEN,
  config: settings,
  scope: {
    file: msg.scopeFile || null,
    missing: msg.scopeMissing || null,
    rules: rules
  }
};
return msg;
