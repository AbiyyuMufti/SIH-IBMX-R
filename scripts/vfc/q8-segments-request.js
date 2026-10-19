// Builds the time segments request of one machine (the line needs none).
// In: msg.asset, msg.token, msg.h, msg.dayFromMs, msg.dayToMs.
// Out 1: msg.method, msg.url, msg.headers and the body for the http node.
// Out 2: the message of a line, which goes straight on.
var cfg = flow.get('cfg');
if (!msg.h.machine) {
  return [null, msg];
}
msg.method = 'POST';
msg.url = cfg.oeeBase + '/assets/' +
  encodeURIComponent(msg.asset.id) + '/timeModelCategoryDistribution';
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};
msg.payload = {
  from: new Date(msg.dayFromMs).toISOString(),
  to: new Date(msg.dayToMs).toISOString(),
  filter: [
    { key: 'PRODUCT', value: [] },
    { key: 'ORDER', value: [] }
  ],
  force: true
};
return [msg, null];
