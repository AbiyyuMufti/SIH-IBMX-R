// Builds the Asset Management request for the machines of one report line.
// In: one line {id, isManual, name} from the split node (msg.payload).
// Out: msg.method, msg.url and msg.headers for the http request node.
var cfg = flow.get('cfg');
// One page of 200 holds every machine of a line.
var PAGE_SIZE = 200;
msg.line = msg.payload;
var filter = JSON.stringify({ parentId: msg.line.id });
msg.method = 'GET';
msg.url = cfg.amBase + '/assets?size=' + PAGE_SIZE +
  '&filter=' + encodeURIComponent(filter);
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/hal+json'
};
delete msg.payload;
return msg;
