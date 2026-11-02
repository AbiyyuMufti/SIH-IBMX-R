// Builds the Provideam report call of one task (read-style POST).
// In: msg.payload = the body file {body, keepTypes}, msg.task. Out: the
// HTTP request for the task's day (msg.method, url, headers, payload).
// Provideam answers HTTP 500 to a body with more than 18 functions.
var PATHS = {
  plan_opt: '/api/v1/Report/ObjectByPeriod',
  run_rates: '/api/v1/Report/ObjectByPeriod',
  line_losses: '/api/v1/report/objectmodelog',
  volume_loss_correction: '/api/v1/report/periodbyobjectandloss'
};
var cfg = flow.get('cfg');

// The read node gives a Buffer, a copied message a {type, data} object.
function text(value) {
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data).toString('utf8');
  }
  return String(value);
}

var file = msg.payload;
if (!file || typeof file !== 'object' || Buffer.isBuffer(file) ||
  file.type === 'Buffer') {
  try {
    file = JSON.parse(text(msg.payload));
  } catch (e) {
    node.error('FAILED body file is not JSON: ' + msg.path, msg);
    return null;
  }
}
if (!file.body) {
  node.error('FAILED body file has no body: ' + msg.path, msg);
  return null;
}

var body = file.body;
body.periods = [
  {
    periodParam: {
      pdDay: ['[' + msg.task.day + 'T00:00:00]']
    }
  }
];
msg.task.keepTypes = file.keepTypes || null;
msg.method = 'POST';
msg.url = cfg.provideam.baseUrl + PATHS[msg.task.type];
msg.headers = {
  'apiKey': cfg.provideam.apiKey,
  'Content-Type': 'application/json-patch+json',
  'Accept': 'application/json'
};
msg.payload = JSON.stringify(body);
delete msg.path;
return msg;
