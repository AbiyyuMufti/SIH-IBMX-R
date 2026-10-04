// Turns one log message into a row for the log file.
// In: msg.payload = log text (optional msg.level and msg.source).
// Out: msg.payload = the row, msg.line = the text for the debug node.
var FLOW_NAME = '__FLOW__';
var cfg = flow.get('cfg') || {};
var text = String(msg.payload);

var seq = (flow.get('logSeq') || 0) + 1;
flow.set('logSeq', seq);

// Most lines start with the production day and the mode: "2026-09-01 [x] ".
var day = '';
var mode = '';
var message = text;
var parts = /^(\d{4}-\d{2}-\d{2}) \[([^\]]*)\] ([\s\S]*)$/.exec(text);
if (parts) {
  day = parts[1];
  mode = parts[2];
  message = parts[3];
}

var level = msg.level;
if (!level) {
  if (/FAILED/.test(message)) {
    level = 'failed';
  } else if (/NOTHING TO WRITE/.test(message)) {
    level = 'warn';
  } else {
    level = 'info';
  }
}

msg.line = text;
msg.payload = {
  ts_utc: new Date().toISOString(),
  seq: seq,
  flow: FLOW_NAME,
  site: cfg.site || 'all',
  production_day: day,
  mode: mode,
  level: level,
  source: msg.source || 'flow',
  message: message
};
return msg;
