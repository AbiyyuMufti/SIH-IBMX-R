// Starts the Configuration view: the folder of the report scope file.
// In: the authenticated GET with view=config. Out 1: msg.path for list
// objects. Out 2: 503 JSON when the Config tab has not run.
var SCOPE_FOLDER = 'reference/report_scope/site=All/';

var cfg = glob.get('cfg');
if (!cfg || !cfg.root) {
  msg.statusCode = 503;
  msg.headers = {
    'content-type': 'application/json'
  };
  msg.payload = {
    error: 'Config is not available: deploy or run the Config tab'
  };
  return [null, msg];
}
msg.path = cfg.root + '/' + SCOPE_FOLDER;
msg.scopeFolder = msg.path;
return [msg, null];
