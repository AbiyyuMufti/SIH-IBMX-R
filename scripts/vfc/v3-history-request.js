// Validates a history query and builds the one-month data-lake folder path.
// In: query.flow and query.month from the authenticated history request.
// Out: the list-objects request, or an explicit 400/503 JSON response.
var FLOWS = [
  'sih-hull',
  'rpt-hull',
  'pbi-report',
  'run-monitor'
];
var query = msg.req && msg.req.query ? msg.req.query : {};
var flowName = String(query.flow || '');
var month = String(query.month || '');

function refuse(code, reason) {
  msg.statusCode = code;
  msg.headers = {
    'content-type': 'application/json'
  };
  msg.payload = {
    error: reason
  };
  return [null, msg];
}

if (FLOWS.indexOf(flowName) === -1) {
  return refuse(400, 'flow must be a known report log');
}
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
  return refuse(400, 'month must be YYYY-MM');
}

var cfg = glob.get('cfg');
if (!cfg || !cfg.root) {
  return refuse(503, 'Config is not available');
}

msg.historyFlow = flowName;
msg.historyMonth = month;
msg.historyFolder = cfg.root + '/logs/' + flowName + '/';
msg.historyName = 'log_' + month + '.csv';
msg.path = msg.historyFolder;
return [msg, null];
