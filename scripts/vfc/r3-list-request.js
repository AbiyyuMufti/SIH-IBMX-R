// Builds the request for the master list that holds the names of the ids.
// In: msg.ids. Out: msg.method, msg.url and msg.headers for the http node.
// The list path is set in LIST_PATH.
var LIST_PATH = '__LIST_PATH__';
var cfg = flow.get('cfg');
msg.method = 'GET';
msg.url = cfg.gateway + '/api/oee/v3/' + LIST_PATH;
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
return msg;
