// Loads editable proof settings and the shared Insights Hub Config.
// In: manual trigger. Out: Graph settings and the lake base address.
var GRAPH_DRIVE_ID = 'PASTE_GRAPH_DRIVE_ID_HERE';
var GRAPH_FOLDER = 'PASTE_SHAREPOINT_FOLDER_PATH_HERE';
var GRAPH_FILE_NAME = 'PASTE_SMALL_FILE_NAME_HERE';
var GRAPH_TOKEN = 'PASTE_GRAPH_TOKEN_HERE';
var LAKE_FOLDER = 'sharepoint-proof';
var MAX_FILE_BYTES = 5242880;
var cfg = glob.get('cfg');

if (!cfg || cfg.platform !== 'xcelerator' || !cfg.xcTenantId) {
  msg.proofFailureReason = 'Run Config with xcelerator selected first';
  node.error(msg.proofFailureReason, msg);
  return null;
}

if (GRAPH_DRIVE_ID.indexOf('PASTE_') === 0 ||
  GRAPH_FOLDER.indexOf('PASTE_') === 0 ||
  GRAPH_FILE_NAME.indexOf('PASTE_') === 0 ||
  GRAPH_TOKEN.indexOf('PASTE_') === 0) {
  msg.proofFailureReason = 'Fill in the SharePoint proof settings';
  node.error(msg.proofFailureReason, msg);
  return null;
}

msg.proof = {
  driveId: GRAPH_DRIVE_ID,
  folder: GRAPH_FOLDER,
  fileName: GRAPH_FILE_NAME,
  graphToken: GRAPH_TOKEN,
  lakeFolder: LAKE_FOLDER,
  maxFileBytes: MAX_FILE_BYTES
};
msg.lakeBase = 'https://api.eu1.siemens.app/datalake-';
msg.lakeBase += cfg.xcTenantId + '/v3';
msg._proofStage = 'settings';
node.status({ fill: 'green', shape: 'dot', text: 'settings ready' });
return msg;
