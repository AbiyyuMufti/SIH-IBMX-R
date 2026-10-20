// Builds the asset list for the debug node ASSET LIST and checks the lines
// of 1.1 CONFIG against Insights Hub.
// In: msg.payload = all assets from the join. Out: msg.payload = {problems,
// lines, paste}: paste holds a block per site to copy into 1.1 CONFIG.
var cfg = flow.get('cfg');
var items = Array.isArray(msg.payload) ? msg.payload : [];
var byId = {};
items.forEach(function (item) {
  byId[item.id] = item;
});

// The Config lines by id, with their site.
var inConfig = {};
cfg.sites.forEach(function (site) {
  (site.lines || []).forEach(function (line) {
    inConfig[line.id] = {
      site: site.name,
      line: line
    };
  });
});

function isExcluded(item) {
  if (cfg.excludeNames.indexOf(item.name) >= 0) {
    return true;
  }
  return item.names.slice(0, -1).some(function (name) {
    return cfg.excludeAncestorNames.indexOf(name) >= 0;
  });
}

// A line is an OEE asset with no OEE asset above it; the OEE assets
// below it are its machines.
var problems = [];
var lines = [];
items.forEach(function (item) {
  if (item.failed) {
    problems.push(item.name + ': ' + item.failed);
    return;
  }
  var isMachine = item.ancestorIds.some(function (id) {
    return Boolean(byId[id]);
  });
  if (isMachine || isExcluded(item)) {
    return;
  }
  var machines = items.filter(function (other) {
    return other.ancestorIds.indexOf(item.id) >= 0;
  }).length;
  lines.push({
    site: item.names[2] || '?',
    path: item.names.slice(2).join(' / '),
    item: item,
    machines: machines
  });
});
lines.sort(function (a, b) {
  return a.path.localeCompare(b.path);
});

// Config lines that are gone, renamed or in another site.
Object.keys(inConfig).forEach(function (id) {
  var entry = inConfig[id];
  var where = entry.site + ' line ' + entry.line.sih;
  var found = byId[id];
  if (!found) {
    problems.push(where + ': id not found in Insights Hub');
    return;
  }
  if (found.name !== entry.line.sih) {
    var text = where + ': Insights Hub now calls it "' + found.name;
    text += '" (Config sih: "' + entry.line.sih + '")';
    problems.push(text);
  }
  if (found.names[2] !== entry.site) {
    problems.push(where + ': it is in site ' + found.names[2]);
  }
});

var out = [];
var paste = {};
lines.forEach(function (entry) {
  var item = entry.item;
  var text = entry.path + ' | ' + (item.isManual ? 'manual' : 'auto');
  text += ' | id ' + item.id + ' | ' + entry.machines + ' machines';
  var known = inConfig[item.id];
  if (known) {
    text += ' | in Config as ' + known.line.report;
    out.push(text);
    return;
  }
  out.push(text + ' | not in Config');
  var block = '{\n';
  block += "  id: '" + item.id + "',\n";
  block += "  sih: '" + item.name + "',\n";
  block += "  report: '?'\n";
  block += '},\n';
  paste[entry.site] = (paste[entry.site] || '') + block;
});

node.status({
  fill: problems.length ? 'yellow' : 'green',
  shape: 'dot',
  text: out.length + ' lines, ' + problems.length + ' problem(s)'
});
msg.payload = {
  problems: problems,
  lines: out,
  paste: paste
};
return msg;
