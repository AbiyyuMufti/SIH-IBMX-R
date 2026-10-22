// Returns a safe, explicit error for monitor-node failures.
// In: a message from a catch node.
// Out: a generic JSON 502 without exposing request credentials.
node.status({
  fill: 'red',
  shape: 'ring',
  text: 'monitor request failed'
});
msg.statusCode = 502;
msg.headers = {
  'content-type': 'application/json'
};
msg.payload = {
  error: 'monitor request failed'
};
return msg;
