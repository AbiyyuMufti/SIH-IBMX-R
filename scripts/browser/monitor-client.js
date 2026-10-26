// Browser code of the monitor page (tabs, status cards, history table,
// backfill form, configuration view). Not a function node: the builder embeds it as text in
// node 2.1 (scripts/vfc/v6-monitor-page.js), inside a function that sets
// presetKey first. Plain ES5 for the browser.
var REFRESH_MS = 10000;
var TABS = [
  'status',
  'history',
  'command',
  'config'
];
// The monitored flows: the builder fills in scripts/monitor-flows.js.
var MONITOR_FLOWS = __MONITOR_FLOWS__;
var FLOW_ORDER = MONITOR_FLOWS.map(function (item) {
  return item.id;
}).concat(['config']);
var FLOW_TITLES = {
  config: 'Config'
};
var FLOW_BACKFILL = {};
MONITOR_FLOWS.forEach(function (item) {
  FLOW_TITLES[item.id] = item.label;
  FLOW_BACKFILL[item.id] = item.backfill;
});
var TONES = {
  running: 'run',
  queued: 'run',
  written: 'ok',
  ready: 'ok',
  accepted: 'ok',
  done: 'ok',
  dry_run: 'idle',
  idle: 'idle',
  info: 'idle',
  'not started': 'idle',
  nothing: 'warn',
  warn: 'warn',
  quiet: 'warn',
  failed: 'bad',
  error: 'bad',
  STUCK: 'bad',
  unavailable: 'bad',
  rejected: 'bad',
  interrupted: 'warn',
  cleared: 'ok'
};
var lastHistory = null;
var historyLoaded = false;
var configLoaded = false;
var openFlows = null;
var key = new URLSearchParams(location.search).get('key') || '';
var base = location.pathname.replace(/\/+$/, '');

function $(id) {
  return document.getElementById(id);
}

function esc(value) {
  var text = String(value === null || value === undefined ? '' : value);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(state) {
  var tone = TONES[state] || 'idle';
  var text = String(state).replace(/_/g, ' ');
  return '<span class="badge ' + tone + '">' + esc(text) + '</span>';
}

function ago(iso) {
  var then = Date.parse(iso || '');
  if (!isFinite(then)) {
    return '';
  }
  var sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 60) {
    return sec + ' s ago';
  }
  if (sec < 3600) {
    return Math.round(sec / 60) + ' min ago';
  }
  if (sec < 172800) {
    return Math.round(sec / 3600) + ' h ago';
  }
  return Math.round(sec / 86400) + ' d ago';
}

function clock(iso) {
  var when = new Date(iso);
  if (!isFinite(when.getTime())) {
    return esc(iso);
  }
  var day = when.toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  });
  return day + ' ' + when.toLocaleTimeString([], {
    hour12: false
  });
}

function url(view, params) {
  var out = base + '?view=' + encodeURIComponent(view);
  out += '&key=' + encodeURIComponent(key);
  Object.keys(params || {}).forEach(function (name) {
    out += '&' + encodeURIComponent(name) + '=';
    out += encodeURIComponent(params[name]);
  });
  return out;
}

function plainKey(text) {
  var found = /[?&]key=([^&\s]+)/.exec(text);
  return (found ? found[1] : text).trim();
}

// Reads an answer as text first: a refusal of the VFC is not JSON.
function answer(response) {
  return response.text().then(function (text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('HTTP ' + response.status + ' ' + text.slice(0, 120));
    }
    if (!response.ok) {
      throw new Error(data.error || 'HTTP ' + response.status);
    }
    return data;
  });
}

// ---------- small building blocks ----------

function label(name) {
  var text = name.replace(/([A-Z])/g, ' $1').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shorten(value) {
  var text;
  if (Array.isArray(value)) {
    text = value.length + ' items';
  } else {
    text = Object.keys(value).map(function (name) {
      return name + ': ' + value[name];
    }).join(', ');
  }
  return text.slice(0, 200);
}

function valueHtml(name, value) {
  if (value === null || value === undefined || value === '') {
    return '<span class="mute">-</span>';
  }
  if (/At$/.test(name)) {
    return '<span title="' + esc(value) + '">' +
      esc(ago(value) || value) + '</span>';
  }
  if (typeof value === 'object') {
    return esc(shorten(value));
  }
  return esc(value);
}

function kvList(data, skip) {
  var out = '';
  Object.keys(data).forEach(function (name) {
    if (skip.indexOf(name) !== -1) {
      return;
    }
    out += '<dt>' + esc(label(name)) + '</dt>';
    out += '<dd>' + valueHtml(name, data[name]) + '</dd>';
  });
  return out ? '<dl class="kv">' + out + '</dl>' : '';
}

function meter(name, done, total) {
  if (!total) {
    return '';
  }
  var pct = Math.min(100, Math.round(100 * done / total));
  var out = '<div class="meter"><span class="mute">' + name + ' ';
  out += done + '/' + total + '</span>';
  out += '<span class="track"><i style="width:' + pct + '%"></i></span>';
  return out + '</div>';
}

function itemTable(items) {
  var names = Object.keys(items || {}).sort().reverse();
  if (!names.length) {
    return '';
  }
  var counts = {};
  names.forEach(function (name) {
    var state = (items[name] || {}).state || 'unknown';
    counts[state] = (counts[state] || 0) + 1;
  });
  var chips = Object.keys(counts).map(function (state) {
    return badge(state) + ' <b>' + counts[state] + '</b>';
  }).join(' ');
  var rows = '';
  names.forEach(function (name) {
    var item = items[name] || {};
    rows += '<tr><td class="nw">' + esc(name.replace('|', ' / '));
    rows += '</td><td>' + badge(item.state || 'unknown') + '</td>';
    rows += '<td>' + esc(item.step || '');
    rows += meter('assets', item.assetsDone, item.assetsTotal);
    rows += meter('parts', item.partsDone, item.partsTotal);
    if (item.trail && item.trail.length) {
      rows += '<div class="sub mute">' + esc(item.trail.join(' > '));
      rows += '</div>';
    }
    rows += '</td><td class="wrap">' + esc(item.detail || '') + '</td>';
    rows += '<td class="nw mute" title="' + esc(item.stepAt || '') + '">';
    rows += esc(ago(item.stepAt)) + '</td></tr>';
  });
  var out = '<div class="chips">' + chips + '</div>';
  out += '<div class="scroll short"><table><thead><tr>';
  out += '<th>Item</th><th>State</th><th>Step</th><th>Detail</th>';
  out += '<th>Updated</th></tr></thead><tbody>' + rows;
  return out + '</tbody></table></div>';
}

// ---------- tab 1: live status ----------

function countChips(data) {
  var counts = {};
  [data.days, data.months].forEach(function (items) {
    Object.keys(items || {}).forEach(function (name) {
      var state = (items[name] || {}).state || 'unknown';
      counts[state] = (counts[state] || 0) + 1;
    });
  });
  return Object.keys(counts).map(function (state) {
    return badge(state) + ' <b>' + counts[state] + '</b>';
  }).join(' ');
}

function lastActivity(data) {
  return Date.parse(data.lastBeatAt || data.startedAt || '') || 0;
}

function flowCard(name, data, open) {
  var state = data.state || 'unknown';
  var tone = TONES[state] || 'idle';
  var when = ago(data.lastBeatAt || data.startedAt);
  var out = '<details class="card ' + tone + '" data-flow="' + esc(name) + '"';
  out += open ? ' open>' : '>';
  out += '<summary><span class="title">';
  out += esc(FLOW_TITLES[name] || name) + '</span>' + badge(state);
  out += '<span class="chips">' + countChips(data) + '</span>';
  out += '<span class="when mute">' + esc(when) + '</span></summary>';
  out += '<div class="body">';
  out += kvList(data, [
    'flow',
    'state',
    'stuck',
    'days',
    'months',
    'lastLog'
  ]);
  if (data.lastLog) {
    out += '<p class="last"><span class="mute">Last log line</span><br>';
    out += esc(data.lastLog) + '</p>';
  }
  out += itemTable(data.days);
  out += itemTable(data.months);
  return out + '</div></details>';
}

function commandTable(commands) {
  if (!commands.length) {
    return '<p class="mute">No backfill commands yet.</p>';
  }
  var rows = '';
  commands.slice(-20).reverse().forEach(function (item) {
    rows += '<tr><td class="nw" title="' + esc(item.at) + '">';
    rows += esc(ago(item.at)) + '</td>';
    rows += '<td>' + esc(FLOW_TITLES[item.flow] || item.flow) + '</td>';
    rows += '<td>' + badge(item.result) + '</td>';
    rows += '<td class="nw">' + esc(item.range || '') + '</td>';
    rows += '<td>' + (item.force ? 'force' : '') + '</td>';
    rows += '<td class="wrap">' + esc(item.detail || '') + '</td></tr>';
  });
  var out = '<div class="scroll"><table><thead><tr><th>When</th>';
  out += '<th>Flow</th><th>Result</th><th>Range</th><th></th>';
  out += '<th>Detail</th></tr></thead><tbody>' + rows;
  return out + '</tbody></table></div>';
}

function openNow() {
  var view = $('statusView');
  if (!view.querySelectorAll) {
    return;
  }
  var found = {};
  var any = false;
  view.querySelectorAll('details').forEach(function (item) {
    any = true;
    if (item.open) {
      found[item.getAttribute('data-flow')] = true;
    }
  });
  if (any) {
    openFlows = found;
  }
}

function renderStatus(data) {
  openNow();
  var flows = data.flows || {};
  // Newest activity first; flows that never ran stay at the bottom.
  var names = Object.keys(flows).sort(function (a, b) {
    var diff = lastActivity(flows[b]) - lastActivity(flows[a]);
    if (diff !== 0) {
      return diff;
    }
    return FLOW_ORDER.indexOf(a) - FLOW_ORDER.indexOf(b);
  });
  var out = '<div class="cards">';
  names.forEach(function (name, index) {
    var open = openFlows ? !!openFlows[name] : index === 0;
    out += flowCard(name, flows[name], open);
  });
  out += '</div><h2>Recent backfill commands</h2>';
  out += commandTable(data.commands || []);
  $('statusView').innerHTML = out;
  $('statusRaw').textContent = JSON.stringify(data, null, 2);
  var minutes = Math.round((data.stuckAfterMs || 0) / 60000);
  $('statusNote').textContent = 'Updated ' +
    new Date().toLocaleTimeString() + '. STUCK = no checkpoint for ' +
    minutes + ' min while a run is active. Newest run first.';
}

function refresh() {
  fetch(url('status')).then(answer).then(function (data) {
    $('statusError').textContent = '';
    renderStatus(data);
  }).catch(function (error) {
    $('statusError').textContent =
      'Status request failed: ' + error.message;
  });
}

// ---------- tab 2: run log history ----------

function renderHistory() {
  if (!lastHistory) {
    return;
  }
  var rows = lastHistory.rows || [];
  var counts = {};
  rows.forEach(function (row) {
    counts[row.level] = (counts[row.level] || 0) + 1;
  });
  var chips = Object.keys(counts).map(function (level) {
    return badge(level) + ' <b>' + counts[level] + '</b>';
  }).join(' ');
  var level = $('levelFilter').value;
  var needle = $('textFilter').value.toLowerCase();
  var shown = rows.filter(function (row) {
    if (level && row.level !== level) {
      return false;
    }
    var hay = [
      row.message,
      row.site,
      row.production_day,
      row.source
    ].join(' ').toLowerCase();
    return hay.indexOf(needle) !== -1;
  }).reverse();
  var body = '';
  shown.forEach(function (row) {
    body += '<tr class="lv-' + (TONES[row.level] || 'idle') + '">';
    body += '<td class="nw" title="' + esc(row.ts_utc) + ' UTC">';
    body += clock(row.ts_utc) + '</td>';
    body += '<td>' + badge(row.level) + '</td>';
    body += '<td class="nw">' + esc(row.site) + '</td>';
    body += '<td class="nw">' + esc(row.production_day) + '</td>';
    body += '<td class="wrap">' + esc(row.message);
    body += '<div class="sub mute">#' + esc(row.seq) + ' ';
    body += esc(row.source) + ' ' + esc(row.mode) + '</div></td></tr>';
  });
  var note = 'Showing ' + shown.length + ' of ' + rows.length + ' rows';
  if (lastHistory.truncated) {
    note += ' (the newest ' + rows.length + ' of ' + lastHistory.count;
    note += '; ' + lastHistory.truncated + ' older rows not loaded)';
  }
  var out = '<div class="chips">' + chips + '</div>';
  out += '<p class="mute">' + esc(note) + ', newest first.</p>';
  if (!shown.length) {
    out += '<p class="empty">No log rows match.</p>';
  } else {
    out += '<div class="scroll tall"><table><thead><tr><th>Time</th>';
    out += '<th>Level</th><th>Site</th><th>Day</th><th>Message</th>';
    out += '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  $('historyView').innerHTML = out;
}

function loadHistory() {
  var params = {
    flow: $('flow').value,
    month: $('month').value
  };
  $('historyError').textContent = '';
  $('historyView').innerHTML = '<p class="mute">Loading...</p>';
  historyLoaded = true;
  fetch(url('history', params)).then(answer).then(function (data) {
    lastHistory = data;
    $('historyRaw').textContent = JSON.stringify(data, null, 2);
    renderHistory();
  }).catch(function (error) {
    $('historyView').innerHTML = '';
    $('historyError').textContent =
      'History request failed: ' + error.message;
  });
}

// ---------- tab 4: configuration ----------

// One table from a list of objects and the columns to show.
function simpleTable(rows, columns) {
  if (!rows.length) {
    return '<p class="mute">None.</p>';
  }
  var out = '<div class="scroll"><table><thead><tr>';
  columns.forEach(function (column) {
    out += '<th>' + esc(column[1]) + '</th>';
  });
  out += '</tr></thead><tbody>';
  rows.forEach(function (row) {
    out += '<tr>';
    columns.forEach(function (column) {
      var value = row[column[0]];
      if (value !== null && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      out += '<td class="wrap">' + esc(value === undefined ? '' : value);
      out += '</td>';
    });
    out += '</tr>';
  });
  return out + '</tbody></table></div>';
}

function renderConfig(data) {
  var cfg = data.config || {};
  var sites = cfg.sites || [];
  var general = {};
  Object.keys(cfg).forEach(function (name) {
    if (name !== 'sites') {
      general[name] = cfg[name];
    }
  });
  var lines = [];
  sites.forEach(function (site) {
    (site.lines || []).forEach(function (line) {
      lines.push({
        site: site.name,
        report: line.report,
        sih: line.sih,
        id: line.id,
        source: line.reportSource || site.reportSource,
        shiftReport: line.shiftReport ? 'yes' : ''
      });
    });
  });
  var scope = data.scope || {};
  var out = '<h2>General</h2>' + kvList(general);
  out += '<p class="mute">Not shown: ' + esc((data.hidden || []).join(', '));
  out += '. Edit in node 1.1 CONFIG of the Config tab.</p>';
  out += '<h2>Sites</h2>' + simpleTable(sites, [
    ['name', 'Site'],
    ['reportSource', 'Source'],
    ['timeZone', 'Time zone'],
    ['dayStartLocal', 'Day start (local)'],
    ['runHourLocal', 'Run hour (local)'],
    ['reportExcludeNames', 'Excluded names']
  ]);
  out += '<h2>SIH lines</h2>' + simpleTable(lines, [
    ['site', 'Site'],
    ['report', 'Report name'],
    ['sih', 'SIH name'],
    ['source', 'Source'],
    ['shiftReport', 'Shift report'],
    ['id', 'Asset id']
  ]);
  out += '<h2>Report scope (In EU Report)</h2>';
  if (scope.missing) {
    out += '<p class="error">' + esc(scope.missing) + '</p>';
  } else if (scope.file) {
    out += '<p class="mute">' + esc(scope.file.path) + ', changed ';
    out += esc(clock(scope.file.lastModified)) + '. Edit ';
    out += 'config/report_scope.csv in the repo and upload it.</p>';
  }
  out += simpleTable(scope.rules || [], [
    ['Site', 'Site'],
    ['Tables', 'Tables'],
    ['Rule', 'Rule'],
    ['Column', 'Column'],
    ['Value', 'Value'],
    ['Why', 'Why']
  ]);
  $('configView').innerHTML = out;
}

function loadConfig() {
  configLoaded = true;
  $('configError').textContent = '';
  $('configView').innerHTML = '<p class="mute">Loading...</p>';
  fetch(url('config')).then(answer).then(function (data) {
    $('configRaw').textContent = JSON.stringify(data, null, 2);
    renderConfig(data);
  }).catch(function (error) {
    $('configView').innerHTML = '';
    $('configError').textContent = 'Configuration not loaded: ' +
      error.message;
  });
}

// ---------- tab 3: backfill command ----------

function updateCommandFields() {
  var months = FLOW_BACKFILL[$('commandFlow').value] === 'months';
  $('dateFields').hidden = months;
  $('monthFields').hidden = !months;
}

function renderCommand(data) {
  var out = '<article class="card ok static"><header><h3>Backfill queued</h3>';
  out += badge(data.accepted ? 'accepted' : 'rejected') + '</header>';
  out += kvList(data, ['accepted']) + '</article>';
  $('commandView').innerHTML = out;
  $('commandResult').textContent = JSON.stringify(data, null, 2);
}

function currentKey() {
  return presetKey || plainKey($('commandKey').value);
}

function clearStuck() {
  var commandKey = currentKey();
  if (!commandKey) {
    $('statusError').textContent =
      'Command key missing: type it on the Backfill tab or set COMMAND_KEY.';
    return;
  }
  var commandUrl = base + '/command?key=' + encodeURIComponent(commandKey);
  fetch(commandUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'clear-stuck'
    })
  }).then(answer).then(function (data) {
    $('statusError').textContent = '';
    $('statusInfo').textContent = 'Cleared ' + data.cleared +
      ' stuck items (only runs with no checkpoint for 30 min).';
    refresh();
  }).catch(function (error) {
    $('statusError').textContent = 'Clear failed: ' + error.message;
  });
}

function sendCommand(event) {
  event.preventDefault();
  var flow = $('commandFlow').value;
  var payload = {
    flow: flow,
    force: $('force').checked
  };
  if (FLOW_BACKFILL[flow] === 'months') {
    payload.from = $('fromMonth').value;
    payload.to = $('toMonth').value;
  } else {
    payload.start = $('start').value;
    payload.end = $('end').value;
  }
  var commandKey = currentKey();
  if (!commandKey) {
    $('commandError').textContent =
      'Command key missing: type it or set COMMAND_KEY in node 2.1.';
    return;
  }
  var commandUrl = base + '/command?key=' + encodeURIComponent(commandKey);
  $('commandError').textContent = '';
  return fetch(commandUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }).then(answer).then(renderCommand).catch(function (error) {
    $('commandError').textContent = 'Command failed: ' + error.message;
  });
}

// ---------- tabs, raw toggles, copy ----------

function showTab(name) {
  TABS.forEach(function (tab) {
    var on = tab === name;
    $('tab-' + tab).className = on ? 'tab on' : 'tab';
    $('tab-' + tab).ariaSelected = on ? 'true' : 'false';
    $('panel-' + tab).hidden = !on;
  });
  try {
    history.replaceState(null, '', '#' + name);
  } catch (e) {
    // no history API (offline test): the tab still switches
  }
  if (name === 'history' && !historyLoaded) {
    loadHistory();
  }
  if (name === 'config' && !configLoaded) {
    loadConfig();
  }
}

function applyRaw(name) {
  var raw = $('raw-' + name).checked;
  $('copy-' + name).textContent = 'Copy JSON';
  $(name + 'View').hidden = raw;
  $(name === 'command' ? 'commandResult' : name + 'Raw').hidden = !raw;
}

function copyRaw(name) {
  var button = $('copy-' + name);
  var id = name === 'command' ? 'commandResult' : name + 'Raw';
  var text = $(id).textContent;
  var done = function (message) {
    button.textContent = message;
  };
  if (!navigator.clipboard) {
    done('Copy not allowed here');
    return;
  }
  navigator.clipboard.writeText(text).then(function () {
    done('Copied');
  }, function () {
    done('Copy failed');
  });
}

// ---------- start ----------

$('keyRow').hidden = presetKey !== '';
$('month').value = new Date().toISOString().slice(0, 7);
TABS.forEach(function (tab) {
  $('tab-' + tab).addEventListener('click', function () {
    showTab(tab);
  });
  $('raw-' + tab).addEventListener('change', function () {
    applyRaw(tab);
  });
  $('copy-' + tab).addEventListener('click', function () {
    copyRaw(tab);
  });
});
$('clearStuck').addEventListener('click', clearStuck);
$('reloadConfig').addEventListener('click', loadConfig);
$('historyForm').addEventListener('submit', function (event) {
  event.preventDefault();
  loadHistory();
});
$('levelFilter').addEventListener('change', renderHistory);
$('textFilter').addEventListener('input', renderHistory);
$('commandFlow').addEventListener('change', updateCommandFields);
$('commandForm').addEventListener('submit', sendCommand);
updateCommandFields();
var wanted = (location.hash || '').slice(1);
showTab(TABS.indexOf(wanted) === -1 ? 'status' : wanted);
refresh();
setInterval(refresh, REFRESH_MS);
