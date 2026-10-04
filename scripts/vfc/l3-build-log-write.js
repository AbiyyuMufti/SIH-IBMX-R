// Prepares the write of one batch of log rows (the read node runs next).
// In: msg.payload = array of log rows from the join node.
// Out: msg.path = file of the month, msg.logRows, msg.logBatchId, no payload.
// msg.logBatch keeps errors of the log nodes themselves out of the log.
var FLOW_NAME = '__FLOW__';
var cfg = flow.get('cfg') || {};
var root = cfg.root || 'logs_without_root';
var rows = msg.payload;
var month = rows[0].ts_utc.slice(0, 7);

var batchNo = (flow.get('logBatchNo') || 0) + 1;
flow.set('logBatchNo', batchNo);

msg.logRows = rows;
msg.path = root + '/logs/' + FLOW_NAME + '/log_' + month + '.csv';
msg.logBatch = true;
msg.logBatchId = rows[0].ts_utc + '#' + batchNo;
delete msg.payload;
return msg;
