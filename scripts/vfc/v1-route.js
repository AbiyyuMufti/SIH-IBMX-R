// Routes the monitor page, status JSON, history request or an unknown path.
// In: an authenticated GET with an optional query parameter `view`.
// Out: exactly one of PAGE, STATUS, HISTORY or ERROR.
var query = msg.req && msg.req.query ? msg.req.query : {};
var view = query.view;

if (view === undefined || view === '' || view === 'page') {
  return [msg, null, null, null];
}
if (view === 'status') {
  return [null, msg, null, null];
}
if (view === 'history') {
  return [null, null, msg, null];
}

msg.statusCode = 404;
msg.headers = {
  'content-type': 'application/json'
};
msg.payload = {
  error: 'unknown monitor endpoint'
};
return [null, null, null, msg];
