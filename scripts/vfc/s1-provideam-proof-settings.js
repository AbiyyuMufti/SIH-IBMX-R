// Builds the Provideam proof request settings for one report day.
// In: manual trigger. Out: msg.proof with the API key, URL and the
// New Plan OPT report body (docs/provideam-samples/23) for DAY.
var PROVIDEAM_API_KEY = 'PASTE_PROVIDEAM_API_KEY_HERE';
var REPORT_NAME = 'New Plan OPT Report';
// Production day YYYY-MM-DD. Empty = yesterday (UTC date).
var DAY = '';
var PROVIDEAM_URL = 'https://rb-api.provideam.com';
PROVIDEAM_URL += '/api/v1/Report/ObjectByPeriod';
// Machine IDs of the saved report (Hull lines).
var MACHINE_IDS = '297,164,165,59,65,57,58,167,166,269,270,209,210,154,';
MACHINE_IDS += '317,295,63,207,221,60,64,169,61,213,214,211,24,206,30,';
MACHINE_IDS += '31,203,202,42,69,68,218,216,212,38,39,40,200,222,275,';
MACHINE_IDS += '249,215,43';
var FIELDS = [
  'fdYYYYMMDD',
  'fdAreaName',
  'fdMachineName',
  'fdShiftName',
  'fdShiftStartTime',
  'fdPartName'
];
// Function name and its column index in the saved report.
var FUNCTIONS = [
  ['fnGoodParts', 2],
  ['fnDefectParts', 4],
  ['fnTarget', 6],
  ['fnCapacity', 8],
  ['fnOEE', 10],
  ['fnTotalTime', 12],
  ['fnPlannedOpT', 13],
  ['fnOEETime', 14],
  ['fnDowntimeUnits', 15]
];

if (PROVIDEAM_API_KEY.indexOf('PASTE_') === 0) {
  msg.proofFailureReason = 'Fill in PROVIDEAM_API_KEY';
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

var body = {
  userId: 2908,
  formattedJson: false,
  applyStdTimeCorrection: true,
  includeGrandTotals: true,
  objects: [
    {
      objectParam: {
        obMachineID: MACHINE_IDS.split(',')
      }
    }
  ],
  fields: FIELDS.map(function (name) {
    return { fieldName: name };
  }),
  functions: FUNCTIONS.map(function (f) {
    return { funcName: f[0], index: f[1] };
  }),
  periods: [
    {
      periodParam: {
        pdDay: ['[' + day + 'T00:00:00]']
      }
    }
  ]
};

msg.proof = {
  apiKey: PROVIDEAM_API_KEY,
  url: PROVIDEAM_URL,
  body: body,
  report: REPORT_NAME,
  day: day
};
msg.proofFile = {
  name: REPORT_NAME + ' ' + day
};
msg._proofStage = 'settings';
node.status({ fill: 'green', shape: 'dot', text: 'settings ready' });
return msg;
