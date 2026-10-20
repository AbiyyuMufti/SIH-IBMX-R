// Starts the asset list: copies the Config settings into flow context
// (the request nodes read flow.get('cfg')).
// In: the button "List SIH assets". Out: the message for the token request.
var shared = glob.get('cfg');
if (!shared) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'CONFIG not stored'
  });
  node.error('global cfg is missing: fix 1.1 CONFIG and click Apply first');
  return null;
}
flow.set('cfg', shared);
node.status({
  fill: 'blue',
  shape: 'dot',
  text: 'listing assets, about one minute'
});
msg.payload = new Date().toISOString().slice(0, 10);
msg.mode = 'assets';
return msg;
