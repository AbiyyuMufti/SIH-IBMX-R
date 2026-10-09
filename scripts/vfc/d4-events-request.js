// Saves the calendar id and builds the calendar events request.
// In: the OEE config response. Out 1: the calendarEvents request for the
// production day. Out 2: the asset result for the join when the config
// call failed or the asset has no calendar (no half days).
var cfg = flow.get('cfg');
var DAY_MS = 86400000;
var HOUR_MS = 3600000;
var name = msg.h.asset_name;

function toJoin(text) {
  msg.payload = {
    assetId: msg.asset.id,
    name: name,
    failed: text,
    skipped: null,
    planRows: [],
    utilRows: [],
    lossRows: []
  };
  delete msg.hours;
  delete msg.kpiMeta;
  return [null, msg];
}

var config = msg.payload || {};
if (msg.statusCode !== 200) {
  return toJoin(name + ': asset config failed, HTTP ' + msg.statusCode);
}
if (!config.calendarId) {
  return toJoin(name + ': asset has no calendar id');
}

// The events that cover the production day D (D start hour to D+1).
var from = Date.parse(msg.day + 'T00:00:00.000Z') + cfg.dayStartHour * HOUR_MS;
msg.calendarId = config.calendarId;
msg.method = 'GET';
msg.url = cfg.gateway + '/api/oee/v3/calendars/' +
  encodeURIComponent(config.calendarId) + '/calendarEvents' +
  '?from=' + new Date(from).toISOString() +
  '&to=' + new Date(from + DAY_MS).toISOString();
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
delete msg.payload;
return [msg, null];
