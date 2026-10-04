// Builds the GET request for one id (reason tree, collection or calendar).
// In: one target {id, name, extra} from the split node.
// Out: msg.method, msg.url and msg.headers for the http request node.
var PATH_BEFORE = '__BEFORE__';
var PATH_AFTER = '__AFTER__';
var WITH_WINDOW = __WINDOW__;
var DAY_MS = 86400000;
var cfg = flow.get('cfg');
msg.target = msg.payload;
var url = cfg.gateway + '/api/oee/v3/' + PATH_BEFORE +
  encodeURIComponent(msg.target.id) + PATH_AFTER;

// Calendar events are read for a window that starts on the run day.
if (WITH_WINDOW) {
  var from = Date.parse(msg.day + 'T00:00:00.000Z');
  var to = from + cfg.calendarWindowDays * DAY_MS;
  url += '?from=' + new Date(from).toISOString();
  url += '&to=' + new Date(to).toISOString();
}
msg.method = 'GET';
msg.url = url;
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
delete msg.payload;
return msg;
