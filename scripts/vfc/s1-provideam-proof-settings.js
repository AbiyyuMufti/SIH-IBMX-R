// Loads the Provideam proof settings and the shared Insights Hub Config.
// In: manual trigger. Out: one report request body with the day set,
// the lake base address and the lake folder.
var PROVIDEAM_API_KEY = 'PASTE_PROVIDEAM_API_KEY_HERE';
// Paste one saved body from docs/provideam-samples/<nn>-*.md (JSON text).
var REPORT_BODY_JSON = 'PASTE_REPORT_BODY_JSON_HERE';
var REPORT_NAME = 'new-plan-opt-report';
// Production day YYYY-MM-DD. Empty = yesterday (UTC date).
var DAY = '';
var LAKE_FOLDER = 'mufti_test/provideam';
var PROVIDEAM_URL = 'https://rb-api.provideam.com';
PROVIDEAM_URL += '/api/v1/Report/ObjectByPeriod';
var cfg = glob.get('cfg');

if (!cfg || cfg.platform !== 'xcelerator' || !cfg.xcTenantId) {
  msg.proofFailureReason = 'Run Config with xcelerator selected first';
  node.error(msg.proofFailureReason, msg);
  return null;
}
if (PROVIDEAM_API_KEY.indexOf('PASTE_') === 0 ||
  REPORT_BODY_JSON.indexOf('PASTE_') === 0) {
  msg.proofFailureReason = 'Fill in the Provideam proof settings';
  node.error(msg.proofFailureReason, msg);
  return null;
}

var body;
try {
  body = JSON.parse(REPORT_BODY_JSON);
} catch (e) {
  msg.proofFailureReason = 'REPORT_BODY_JSON is not valid JSON';
  node.error(msg.proofFailureReason, msg);
  return null;
}

var day = DAY;
if (!day) {
  var d = new Date(Date.now() - 86400000);
  day = d.toISOString().slice(0, 10);
}
if (!/^\d{4}-\d\d-\d\d$/.test(day)) {
  msg.proofFailureReason = 'DAY must be YYYY-MM-DD';
  node.error(msg.proofFailureReason, msg);
  return null;
}
// Provideam period text: one day as [<day>T00:00:00].
body.periods = [
  {
    periodParam: {
      pdDay: ['[' + day + 'T00:00:00]']
    }
  }
];

msg.proof = {
  apiKey: PROVIDEAM_API_KEY,
  url: PROVIDEAM_URL,
  body: body,
  day: day,
  lakeFolder: LAKE_FOLDER
};
msg.proofFile = {
  name: REPORT_NAME + '_' + day + '.json'
};
msg.lakeBase = 'https://api.eu1.siemens.app/datalake-';
msg.lakeBase += cfg.xcTenantId + '/v3';
msg._proofStage = 'settings';
node.status({ fill: 'green', shape: 'dot', text: 'settings ready' });
return msg;
