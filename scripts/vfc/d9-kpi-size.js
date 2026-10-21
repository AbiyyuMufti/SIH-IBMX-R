// Sends the answer of a day evaluateKPIs call on, or to the hourly parts.
// In: the answer of the http request node. Out 1: the answer, to the check
// node. Out 2: HTTP 413 (the day is too big for one call): to the hourly
// parts, which ask the same KPIs hour by hour and merge them.
if (msg.statusCode === 413) {
  return [null, msg];
}
return [msg, null];
