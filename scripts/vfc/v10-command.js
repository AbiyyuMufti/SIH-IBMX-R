// Validates a backfill command, records its audit entry and emits one target.
// In: JSON {flow, force, start/end} or {flow, force, from/to, tables, sites}.
// Out: HTTP 202/400/409/503, one BACKFILL message, and a CSV log message.
var DAILY_FLOWS = ['sih-hull', 'rpt-hull'];
var PBI_TABLES = [
  'Plan_OPT_EU',
  'Time_Utilisation_EU',
  'Daily_Losses_EU'
];
var MAX_DAYS = 31;
var MAX_MONTHS = 12;

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

function response(status, body) {
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
  return [
    response(status, {
      accepted: false,
      error: reason
    }),
    null,
    null,
    null,
    log
  ];
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

function busy(flowName) {
  if (flowName === 'pbi-report' &&
      (glob.get('jobQueue') || []).length > 0) {
    return true;
  }
  var status = glob.get('runStatus_' + flowName);
  if (!status) {
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
var flowName = String(request.flow || '');
if (DAILY_FLOWS.indexOf(flowName) === -1 &&
    flowName !== 'pbi-report') {
  return refuse(400, 'flow must be a known report flow', '', '');
}
acceptedFlow = flowName;

if (!cfg || !cfg.root || !Array.isArray(cfg.sites)) {
  return refuse(503, 'Config is not available', acceptedFlow, '');
}

var range = '';
var dailyPayload = null;
var pbiPayload = null;
if (DAILY_FLOWS.indexOf(flowName) !== -1) {
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
  pbiPayload = {
    from: request.from,
    to: request.to
  };
  if (request.tables !== undefined) {
    if (!Array.isArray(request.tables) || !request.tables.length ||
        request.tables.some(function (table) {
          return PBI_TABLES.indexOf(table) === -1;
        })) {
      return refuse(400, 'tables must be known PBI report tables', flowName,
        '');
    }
    pbiPayload.tables = request.tables.slice();
  }
  if (request.sites !== undefined) {
    if (!Array.isArray(request.sites) || !request.sites.length ||
        request.sites.some(function (site) {
          return sites.indexOf(site) === -1;
        })) {
      return refuse(400, 'sites must be present in Config', flowName, '');
    }
    pbiPayload.sites = request.sites.slice();
  }
  range = request.from + '..' + request.to;
}

if (busy(flowName) && !force) {
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
  var tableSummary = (pbiPayload.tables || ['all']).join(', ').slice(0, 120);
  var siteSummary = (pbiPayload.sites || ['all']).join(', ').slice(0, 120);
  glob.set('runStatus_pbi-report', {
    flow: 'pbi-report',
    state: 'queued',
    source: 'monitor',
    startedAt: now,
    lastBeatAt: now,
    job: {
      tables: tableSummary,
      sites: siteSummary,
      from: pbiPayload.from,
      to: pbiPayload.to
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
if (flowName === 'sih-hull') {
  return [
    result,
    {
      payload: dailyPayload
    },
    null,
    null,
    log
  ];
}
if (flowName === 'rpt-hull') {
  return [
    result,
    null,
    {
      payload: dailyPayload
    },
    null,
    log
  ];
}
return [
  result,
  null,
  null,
  {
    payload: pbiPayload
  },
  log
];
