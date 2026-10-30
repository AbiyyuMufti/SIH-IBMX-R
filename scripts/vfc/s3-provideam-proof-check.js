// Checks the Provideam response and keeps its text as it came.
// In: report response as text. Out: the bytes to store and the row count.
if (msg.statusCode !== 200) {
  msg.proofFailureReason = 'Provideam HTTP ' + msg.statusCode;
  node.error(msg.proofFailureReason, msg);
  return null;
}

var text = String(msg.payload || '');
var rows;
try {
  rows = JSON.parse(text).processedData;
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

msg.fileBytes = Buffer.from(text, 'utf8');
msg.fileSize = msg.fileBytes.length;
msg.rowCount = rows.length;
delete msg.proof.apiKey;
delete msg.headers;
delete msg.payload;
node.status({
  fill: 'blue',
  shape: 'dot',
  text: rows.length + ' rows from Provideam'
});
return msg;
