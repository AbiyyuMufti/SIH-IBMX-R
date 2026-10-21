// Packs the answer of one hourly evaluateKPIs call with its status code, so
// the join that follows keeps both.
// In: the answer of the http request node. Out: msg.payload = {statusCode,
// body}.
msg.payload = {
  statusCode: msg.statusCode,
  body: msg.payload
};
return msg;
