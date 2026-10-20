// Keeps the assets in the message and starts the Machine Names check.
// In: msg.payload = all assets from the join. Out: msg.assets = the assets,
// msg.payload = the site names of 1.1 CONFIG (split into one per site).
var cfg = flow.get('cfg');

msg.assets = Array.isArray(msg.payload) ? msg.payload : [];
msg.payload = cfg.sites.map(function (site) {
  return site.name;
});
return msg;
