// Builds the asset list for the debug node ASSET LIST and checks the lines
// of 1.1 CONFIG against Insights Hub and the Machine Names files.
// In: msg.assets = all assets, msg.payload = one item per site {name,
// failed, names}. Out: msg.payload = {problems, lines, paste}.
var cfg = flow.get('cfg');
var items = Array.isArray(msg.assets) ? msg.assets : [];
var sites = Array.isArray(msg.payload) ? msg.payload : [];
var problems = [];
var byId = {};
items.forEach(function (item) {
  byId[item.id] = item;
});

// The MachineName values of each site's Machine Names file.
var namesBySite = {};
sites.forEach(function (site) {
  if (site.failed) {
    problems.push(site.failed);
    return;
  }
  namesBySite[site.name] = site.names || [];
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

// Letters and digits only, lower case: "B2  line" and "b2 Line" match.
function key(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// The Machine Names entry with the same letters and digits, else ''.
function findReport(site, sihName) {
  var hits = (namesBySite[site] || []).filter(function (name) {
    return key(name) === key(sihName);
  });
  return hits.length ? hits[0] : '';
}

// Machine Names entries with the same first word ("B2 Line": "B2 Auto"),
// else all names of a small file ("L2": "Line 2").
var ALL_NAMES_UP_TO = 12;
function similar(site, sihName) {
  var names = namesBySite[site] || [];
  var first = key(String(sihName).split(' ')[0]);
  var near = names.filter(function (name) {
    return key(String(name).split(' ')[0]) === first;
  });
  if (!near.length && names.length <= ALL_NAMES_UP_TO) {
    return names;
  }
  return near;
}

// A line is an OEE asset with no OEE asset above it; the OEE assets
// below it are its machines.
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

// Config lines that are gone, renamed, in another site, or whose report
// name is not in the Machine Names file of the site.
Object.keys(inConfig).forEach(function (id) {
  var entry = inConfig[id];
  var where = entry.site + ' line ' + entry.line.sih;
  var names = namesBySite[entry.site];
  if (names && names.indexOf(entry.line.report) === -1) {
    var miss = where + ': report "' + entry.line.report;
    miss += '" is not a MachineName in the Machine Names file';
    problems.push(miss);
  }
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

// One text per line; a paste block for the lines not in Config, with the
// report name from the Machine Names file, or '?' and the close names.
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
  var report = findReport(entry.site, item.name);
  out.push(text + ' | not in Config, report ' + (report || '?'));
  var block = '';
  if (!report) {
    var note = namesBySite[entry.site] ?
      'not in Machine Names' :
      'no Machine Names file read';
    block += '// ' + item.name + ': ' + note;
    var near = similar(entry.site, item.name);
    if (near.length) {
      block += ', close: ' + near.join(', ');
    }
    block += '\n';
  }
  block += '{\n';
  block += "  id: '" + item.id + "',\n";
  block += "  sih: '" + item.name + "',\n";
  block += "  report: '" + (report || '?') + "'\n";
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
delete msg.assets;
return msg;
