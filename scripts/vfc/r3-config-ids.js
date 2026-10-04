// Reads one id from the OEE config response of one asset.
// In: the config response. Out: msg.payload = {name, value, failed} for the
// join. The id to read is set in FIELD.
var FIELD = '__FIELD__';
var name = msg.asset.name;
var item = {
  name: name,
  value: null,
  failed: null
};

if (msg.statusCode !== 200 || !msg.payload) {
  item.failed = name + ': config failed, HTTP ' + msg.statusCode;
} else {
  item.value = msg.payload[FIELD] || null;
}
msg.payload = item;
return msg;
