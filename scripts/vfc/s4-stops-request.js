// Builds the downtimeReasons request for one asset and one production day.
// In: msg.kpiRows (already built). Out: msg.method, msg.url and msg.headers
// for the http request node.
var cfg = flow.get('cfg');
var DAY_MS = 86400000;
// A production day D runs from D 06:00Z to D+1 06:00Z.
var DAY_START = 'T06:00:00.000Z';
// One page of 5000 holds every stop of a day (tested: 423 stops with
// size 1000). More than one page makes the day fail in node 4.2.
var PAGE_SIZE = 5000;

var from = Date.parse(msg.day + DAY_START);
var fromIso = new Date(from).toISOString();
var toIso = new Date(from + DAY_MS).toISOString();
var query = '?from=' + encodeURIComponent(fromIso) +
  '&to=' + encodeURIComponent(toIso) +
  '&size=' + PAGE_SIZE + '&page=0';
msg.method = 'GET';
msg.url = cfg.gateway + '/api/oee/v3/assets/' +
  encodeURIComponent(msg.asset.id) + '/downtimeReasons' + query;
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
return msg;
