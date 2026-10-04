// Starts one run. In: any message from CONFIG (inject or test start).
// Out: msg.payload = the run day text YYYY-MM-DD, and msg.mode.
// A start like {start: 'YYYY-MM-DD'} fixes the day, otherwise it is today.
var day = new Date().toISOString().slice(0, 10);
var start = msg.payload;
if (start && typeof start === 'object' && start.start) {
  day = start.start;
}
msg.payload = day;
msg.mode = 'reference';
return msg;
