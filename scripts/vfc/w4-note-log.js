// Notes the time of the newest log line in flow context "lastLog".
// In: every log line (a tap behind the log formatter). Out: nothing. A new
// line also clears the "done" flag, so the next quiet period is reported.
flow.set('lastLog', Date.now());
flow.set('done', false);
return null;
