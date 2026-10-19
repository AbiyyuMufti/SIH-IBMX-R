// Packs the machine list answer of one line together with the line, so the
// join node that follows keeps both.
// In: the Asset Management answer (msg.payload) and msg.line.
// Out: msg.payload = {line, statusCode, body}.
msg.payload = {
  line: msg.line,
  statusCode: msg.statusCode,
  body: msg.payload
};
delete msg.line;
return msg;
