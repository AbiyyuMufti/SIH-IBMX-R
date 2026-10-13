// Builds the filterValues request: the products and orders of the day.
// In: msg.asset, msg.token and msg.day after the shift steps.
// Out: msg.method, msg.url and msg.headers for the http request node.
var cfg = flow.get('cfg');
var DAY_MS = 86400000;
var HOUR_MS = 3600000;

// A production day D runs from D start hour to D+1 start hour (UTC).
var from = Date.parse(msg.day + 'T00:00:00.000Z') + cfg.dayStartHour * HOUR_MS;
var url = cfg.oeeBase + '/assets/';
url += encodeURIComponent(msg.asset.id) + '/filterValues';
url += '?from=' + new Date(from).toISOString();
url += '&to=' + new Date(from + DAY_MS).toISOString();

msg.method = 'GET';
msg.url = url;
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
delete msg.payload;
return msg;
