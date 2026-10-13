// Builds the evaluateKPIs request of ONE product or order of the day.
// In: msg.job = {key: PRODUCT or ORDER, value}, msg.asset, msg.day.
// Out: the same POST as 3.2, filtered on that value, hourly.
var cfg = flow.get('cfg');
var DAY_MS = 86400000;
var HOUR_MS = 3600000;
var from = Date.parse(msg.day + 'T00:00:00.000Z') + cfg.dayStartHour * HOUR_MS;

function filterFor(key) {
  return { key: key, value: msg.job.key === key ? [msg.job.value] : [] };
}

msg.method = 'POST';
msg.url = cfg.oeeBase + '/expressions/evaluateKPIs';
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};
msg.payload = {
  assetId: msg.asset.id,
  scope: {
    from: new Date(from).toISOString(),
    to: new Date(from + DAY_MS).toISOString(),
    filter: [
      filterFor('PRODUCT'),
      filterFor('ORDER'),
      { key: 'SHIFT', value: [] }
    ],
    recursive: false,
    groupedByDateTime: true
  }
};
return msg;
