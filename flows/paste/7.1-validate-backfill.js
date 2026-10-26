// Validates a backfill command, records its audit entry and emits one target.
// In: JSON {flow, force, start/end} or {flow, force, from/to, tables, sites}.
// Out 1: HTTP 202/400/409/503. Then one output per backfill flow of the list
// (its BACKFILL message), last a CSV log message.

// The monitored flows: the builder fills in scripts/monitor-flows.js.
var MONITOR_FLOWS = [
  {
    id: 'sih-hull',
    label: 'SIH report daily',
    backfill: 'days',
    log: true
  },
  {
    id: 'rpt-hull',
    label: 'Shift report',
    backfill: 'days',
    log: true
  },
  {
    id: 'pbi-report',
    label: 'PBI report build',
    backfill: 'months',
    log: true,
    tables: [
      'Plan_OPT_EU',
      'Time_Utilisation_EU',
      'Daily_Losses_EU'
    ],
    queueKey: 'jobQueue'
  },
  {
    id: 'pbi-report-2',
    label: 'PBI report build 2',
    backfill: 'months',
    log: true,
    tables: ['Run_Rates_EU', 'Volume_CoV_EU', 'Format_List_EU'],
    queueKey: 'jobQueue_2'
  },
  {
    id: 'pbi-listener',
    label: 'PBI listener',
    backfill: null,
    log: false
  }
];
var BACKFILL_FLOWS = MONITOR_FLOWS.filter(function (item) {
  return item.backfill === 'days' || item.backfill === 'months';
});
var MAX_DAYS = 31;
var MAX_MONTHS = 12;
var DUPLICATE_MS = 5000;
// Same limit as the STUCK state of the status page.
var STALE_MS = 30 * 60 * 1000;

function findFlow(id) {
  var found = BACKFILL_FLOWS.filter(function (item) {
    return item.id === id;
  });
  return found.length ? found[0] : null;
}

// Output 1 the answer, then one output per backfill flow, last the log.
function outputs(answer, target, payload, log) {
  var out = [answer];
  BACKFILL_FLOWS.forEach(function (item) {
    out.push(item.id === target ? {
      payload: payload
    } : null);
  });
  out.push(log);
  return out;
}

// The VFC http in node can hand the POST body over as an object, as JSON
// text, as a Buffer (also serialised) or in msg.req.body: take all of them.
function parseBody(value) {
  var text = null;
  if (typeof value === 'string') {
    text = value;
  } else if (Buffer.isBuffer(value)) {
    text = value.toString('utf8');
  } else if (value && value.type === 'Buffer' && value.data) {
    text = Buffer.from(value.data).toString('utf8');
  } else {
    return value;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return undefined;
  }
}

function describe(value) {
  if (value === undefined || value === null) {
    return 'nothing';
  }
  return Buffer.isBuffer(value) ? 'a Buffer' : typeof value;
}

var request = parseBody(msg.payload);
var gotBody = describe(msg.payload);
if (!request || typeof request !== 'object') {
  request = parseBody(msg.req && msg.req.body);
  gotBody += ', req.body ' + describe(msg.req && msg.req.body);
}
var commandKey = JSON.stringify(request);
var previous = glob.get('lastCommand');
if (previous && previous.key === commandKey &&
    Date.now() - previous.at < DUPLICATE_MS) {
  var again = Object.assign({}, msg);
  again.statusCode = previous.status;
  again.headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };
  again.payload = previous.body;
  return outputs(again, '', null, null);
}
var acceptedFlow = '';
var force = !!(request && request.force === true);
var cfg = glob.get('cfg');

function audit(result, flowName, range, forced, detail) {
  var events = glob.get('runMonitorCommands') || [];
  var entry = {
    at: new Date().toISOString(),
    flow: flowName,
    result: result,
    force: forced,
    range: range,
    detail: detail
  };
  events.push(entry);
  if (events.length > 50) {
    events.splice(0, events.length - 50);
  }
  glob.set('runMonitorCommands', events);

  if (!cfg || !cfg.root) {
    return null;
  }
  flow.set('cfg', {
    root: cfg.root
  });
  return {
    payload: '[command] ' + result.toUpperCase() + ': ' + flowName +
      (range ? ' ' + range : '') + (forced ? ' force=true' : ''),
    level: result === 'accepted' ? 'info' : 'warn',
    source: 'run-monitor'
  };
}

// The VFC was seen to run this node twice for one POST (30 ms apart): an
// identical command within DUPLICATE_MS gets the first answer again.
function response(status, body) {
  glob.set('lastCommand', {
    key: commandKey,
    at: Date.now(),
    status: status,
    body: body
  });
  var out = Object.assign({}, msg);
  out.statusCode = status;
  out.headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };
  out.payload = body;
  return out;
}

function refuse(status, reason, flowName, range) {
  var name = flowName || 'unknown';
  var log = audit('rejected', name, range || '', force, reason);
  return outputs(response(status, {
    accepted: false,
    error: reason
  }), '', null, log);
}

function validDay(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  var parts = value.split('-').map(Number);
  var date = new Date(0);
  date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== parts[0] ||
      date.getUTCMonth() !== parts[1] - 1 ||
      date.getUTCDate() !== parts[2]) {
    return null;
  }
  return date.getTime();
}

function monthIndex(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return null;
  }
  return Number(value.slice(0, 4)) * 12 +
    Number(value.slice(5, 7)) - 1;
}

// True when a status has had no checkpoint for STALE_MS (a dead run).
function stale(status) {
  var beat = Date.parse(status.lastBeatAt || status.startedAt || '');
  return isFinite(beat) && Date.now() - beat > STALE_MS;
}

// Sets every running or queued item of a dead run to interrupted.
function clearItems(items) {
  var count = 0;
  Object.keys(items || {}).forEach(function (name) {
    var item = items[name];
    if (item.state === 'running' || item.state === 'queued') {
      item.state = 'interrupted';
      item.detail = 'run stopped before this item finished';
      count++;
    }
  });
  return count;
}

function clearStuck() {
  var count = 0;
  BACKFILL_FLOWS.forEach(function (item) {
    var name = item.id;
    var status = glob.get('runStatus_' + name);
    if (!status || !stale(status)) {
      return;
    }
    count += clearItems(status.days) + clearItems(status.months);
    if (status.state === 'running' || status.state === 'queued') {
      status.state = item.backfill === 'months' ? 'interrupted' : 'idle';
      count++;
    }
    glob.set('runStatus_' + name, status);
  });
  return count;
}

function busy(item) {
  if (item.queueKey && (glob.get(item.queueKey) || []).length > 0) {
    return true;
  }
  var status = glob.get('runStatus_' + item.id);
  if (!status || stale(status)) {
    return false;
  }
  if (status.state === 'running' || status.state === 'queued') {
    return true;
  }
  return Object.keys(status.days || {}).some(function (day) {
    return status.days[day].state === 'running' ||
      status.days[day].state === 'queued';
  });
}

if (!request || typeof request !== 'object' || Array.isArray(request)) {
  return refuse(
    400,
    'payload must be a JSON object (got ' + gotBody + ')',
    '',
    ''
  );
}
if (request.force !== undefined && typeof request.force !== 'boolean') {
  return refuse(400, 'force must be a boolean', '', '');
}
if (request.action === 'clear-stuck') {
  var cleared = clearStuck();
  var clearLog = audit('cleared', 'all', '', false, cleared + ' items');
  return outputs(response(200, {
    accepted: true,
    action: 'clear-stuck',
    cleared: cleared
  }), '', null, clearLog);
}
var flowName = String(request.flow || '');
var target = findFlow(flowName);
if (!target) {
  return refuse(400, 'flow must be a known report flow', '', '');
}
acceptedFlow = flowName;

if (!cfg || !cfg.root || !Array.isArray(cfg.sites)) {
  return refuse(503, 'Config is not available', acceptedFlow, '');
}

var range = '';
var dailyPayload = null;
var monthPayload = null;
if (target.backfill === 'days') {
  var startMs = validDay(request.start);
  var endMs = validDay(request.end);
  if (startMs === null || endMs === null || endMs < startMs) {
    return refuse(
      400,
      'start and end must be valid YYYY-MM-DD dates, start not after end',
      flowName,
      ''
    );
  }
  var days = Math.floor((endMs - startMs) / 86400000) + 1;
  if (days > MAX_DAYS) {
    return refuse(
      400,
      'date range must not exceed ' + MAX_DAYS + ' days',
      flowName,
      ''
    );
  }
  range = request.start + '..' + request.end;
  dailyPayload = {
    start: request.start,
    end: request.end
  };
} else {
  var fromIndex = monthIndex(request.from);
  var toIndex = monthIndex(request.to);
  if (fromIndex === null || toIndex === null || toIndex < fromIndex) {
    return refuse(
      400,
      'from and to must be valid YYYY-MM months, from not after to',
      flowName,
      ''
    );
  }
  var months = toIndex - fromIndex + 1;
  if (months > MAX_MONTHS) {
    return refuse(
      400,
      'month range must not exceed ' + MAX_MONTHS + ' months',
      flowName,
      ''
    );
  }
  var sites = cfg.sites.map(function (site) {
    return site.name;
  });
  monthPayload = {
    from: request.from,
    to: request.to
  };
  if (request.tables !== undefined) {
    if (!Array.isArray(request.tables) || !request.tables.length ||
        request.tables.some(function (table) {
          return (target.tables || []).indexOf(table) === -1;
        })) {
      return refuse(400, 'tables must be known PBI report tables', flowName,
        '');
    }
    monthPayload.tables = request.tables.slice();
  }
  if (request.sites !== undefined) {
    if (!Array.isArray(request.sites) || !request.sites.length ||
        request.sites.some(function (site) {
          return sites.indexOf(site) === -1;
        })) {
      return refuse(400, 'sites must be present in Config', flowName, '');
    }
    monthPayload.sites = request.sites.slice();
  }
  range = request.from + '..' + request.to;
}

if (busy(target) && !force) {
  return refuse(
    409,
    'flow is busy; set force=true to allow a concurrent backfill',
    flowName,
    range
  );
}

var now = new Date().toISOString();
if (dailyPayload) {
  var current = glob.get('runStatus_' + flowName) || {
    flow: flowName
  };
  current.state = 'queued';
  current.mode = 'backfill';
  current.runId = 'monitor-' + Date.now().toString(36);
  current.startedAt = now;
  current.lastBeatAt = now;
  current.days = {};
  glob.set('runStatus_' + flowName, current);
} else {
  var tableSummary = (monthPayload.tables || ['all']).join(', ')
    .slice(0, 120);
  var siteSummary = (monthPayload.sites || ['all']).join(', ')
    .slice(0, 120);
  glob.set('runStatus_' + flowName, {
    flow: flowName,
    state: 'queued',
    source: 'monitor',
    startedAt: now,
    lastBeatAt: now,
    job: {
      tables: tableSummary,
      sites: siteSummary,
      from: monthPayload.from,
      to: monthPayload.to
    },
    lastLog: ''
  });
}

var log = audit('accepted', flowName, range, force, '');
var result = response(202, {
  accepted: true,
  flow: flowName,
  range: range,
  forced: force
});
return outputs(result, flowName, dailyPayload || monthPayload, log);
