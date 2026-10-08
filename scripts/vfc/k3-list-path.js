// Sets the folder to list for the list objects test.
// In: msg.payload = JSON {"path": "<folder or file in the lake>"}.
// Out: msg.path for the list objects node. Read the result in the debug.
var path = msg.payload && msg.payload.path;
if (!path) {
  node.error('payload needs a path, e.g. {"path":"reports/fact_kpi"}', msg);
  return null;
}
msg.path = path;
return msg;
