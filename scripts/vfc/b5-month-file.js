// Sets the month file for the read node.
// In: msg.payload = {month, key} (one month after the split). Out: msg.month
// and msg.path = the file, without a tenant folder or a leading slash.
var TENANT_PREFIX = /^\/?(data\/ten=[^\/]+\/)?/;

msg.month = msg.payload.month;
msg.path = String(msg.payload.key).replace(TENANT_PREFIX, '');
delete msg.payload;
return msg;
