// Checks the Provideam response and shows the report rows.
// In: report response as text. Out: msg.payload with the report name,
// day, row count and the rows (processedData) for the debug sidebar.
if (msg.statusCode !== 200) {
  msg.proofFailureReason = 'Provideam HTTP ' + msg.statusCode;
  node.error(msg.proofFailureReason, msg);
  return null;
}

var rows;
try {
  rows = JSON.parse(String(msg.payload || '')).processedData;
} catch (e) {
  msg.proofFailureReason = 'Provideam response is not JSON';
  node.error(msg.proofFailureReason, msg);
  return null;
}
if (!Array.isArray(rows)) {
  msg.proofFailureReason = 'Provideam response has no processedData';
  node.error(msg.proofFailureReason, msg);
  return null;
}

msg.payload = {
  report: msg.proof.report,
  day: msg.proof.day,
  rowCount: rows.length,
  rows: rows
};
delete msg.proof;
delete msg.headers;
delete msg.url;
delete msg.method;
delete msg._proofStage;
node.status({
  fill: 'green',
  shape: 'dot',
  text: rows.length + ' rows from Provideam'
});
return msg;
