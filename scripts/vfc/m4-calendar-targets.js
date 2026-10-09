// Turns the distinct calendar ids into one target per id.
// In: msg.ids (list of calendar ids). Out: msg.payload = [{id, name, extra}]
// for the split node.
msg.payload = msg.ids.map(function (id) {
  return {
    id: id,
    name: null,
    extra: null
  };
});
delete msg.ids;
node.status({
  fill: 'blue',
  shape: 'dot',
  text: msg.payload.length + ' calendar(s)'
});
return msg;
