// Routes the monitor page, status JSON, history request or an unknown path.
// In: an authenticated GET with the optional route parameter `view`.
// Out: exactly one of PAGE, STATUS, HISTORY or ERROR.
var view = msg.req && msg.req.params && msg.req.params.view;

if (!view) {
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
