// Saves the config of one asset and builds the thresholds request.
// In: the OEE config response. Out: msg.configInfo (status and the calendar
// and product collection ids) plus the request for the thresholds call.
var cfg = flow.get('cfg');
var config = msg.payload || {};
msg.configInfo = {
  status: msg.statusCode,
  calendarId: config.calendarId || null,
  productCollectionId: config.productCollectionId || null
};
msg.method = 'GET';
msg.url = cfg.gateway + '/api/oee/v3/assets/' +
  encodeURIComponent(msg.asset.id);
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
delete msg.payload;
return msg;
