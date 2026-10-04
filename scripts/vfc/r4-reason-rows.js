// Builds the dim_reason rows of one reason tree.
// In: the reasons response (flat list with parentId) and msg.target.
// Out: msg.payload = an item {name, failed, skipped, rows} for the join.
var MAX_DEPTH = 20;
var target = msg.target;
var label = target.name || String(target.id).slice(0, 6) + '...';
var item = {
  name: label,
  failed: null,
  skipped: null,
  rows: []
};

var reasons = msg.payload && msg.payload.reasons;
if (msg.statusCode !== 200 || !Array.isArray(reasons)) {
  var text = 'reason tree ' + label + ' failed, HTTP ';
  item.failed = text + msg.statusCode;
  msg.payload = item;
  return msg;
}

var byId = {};
reasons.forEach(function (r) {
  byId[r.id] = r;
});

// Names from the top level down to the reason, found through parentId.
function pathOf(reason) {
  var names = [];
  var current = reason;
  var depth = 0;
  while (current && depth < MAX_DEPTH) {
    names.unshift(current.name);
    current = byId[current.parentId];
    depth++;
  }
  return names;
}

reasons.forEach(function (r) {
  var names = pathOf(r);
  item.rows.push({
    reason_tree_id: target.id,
    tree_name: target.name,
    reason_id: r.id,
    reason_name: r.name,
    parent_id: r.parentId || null,
    level: names.length,
    top_level_name: names[0],
    full_path: names.join(' / '),
    justification: !!r.justification,
    loaded_at: msg.loadedAt
  });
});
msg.payload = item;
return msg;
