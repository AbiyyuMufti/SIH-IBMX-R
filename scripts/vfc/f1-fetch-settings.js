// FETCH SETTINGS of the Provideam fetch: sites, days, dry run.
// In: the daily clock (no payload) or the backfill {start, end} (production
// days YYYY-MM-DD, optional sites). Out: msg.payload = one task
// {site, type, day} per site, report type and day (a split follows).

// Sites to fetch. A site also needs reportSource 'provideam' in 1.1 CONFIG
// and its report bodies in <root>/reference/provideam_reports/site=<Site>/.
var SITES = [
  'Hull',
  'Nottingham',
  'Weinheim'
];
// The clock run fetches this many production days before today, again
// every day, so late corrections in Provideam reach the report.
var DAYS_BACK = 3;
// The first day of the day files. The days before are month files that
// this tab never touches.
var FIRST_DAY = '2026-11-01';
// Longest backfill in days.
var MAX_DAYS = 14;
// true: fetch and convert only, write no file and start no build.
var DRY_RUN = true;
var TYPES = [
  'plan_opt',
  'run_rates',
  'line_losses',
  'volume_loss_correction'
];
var FLOW = 'provideam-fetch';
var IN_BODIES = 'reference/provideam_reports';
var OUT_SOURCE = 'pbi_report/source';

function fail(text) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: text
  });
  node.error(text);
  return null;
}

// Days from the first to the last one, both YYYY-MM-DD.
function dayList(from, to) {
  var out = [];
  var t = Date.parse(from + 'T00:00:00Z');
  var last = Date.parse(to + 'T00:00:00Z');
  while (t <= last) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 86400000;
  }
  return out;
}

var shared = glob.get('cfg');
if (!shared) {
  return fail('global cfg is missing: deploy or run the Config tab first');
}
var api = shared.provideam || {};
if (!api.baseUrl || !api.apiKey || /^PUT_/.test(api.apiKey)) {
  return fail('fill in provideam.apiKey in 1.1 CONFIG');
}

var p = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
var backfill = !!(p.start && p.end);
var sites = Array.isArray(p.sites) ? p.sites : SITES;
var notProvideam = sites.filter(function (name) {
  var site = shared.sites.filter(function (s) {
    return s.name === name;
  })[0];
  return !site || site.reportSource !== 'provideam';
});
if (notProvideam.length) {
  return fail('not a Provideam site in 1.1 CONFIG: ' + notProvideam.join(', '));
}

var days;
if (backfill) {
  var isDay = /^\d{4}-\d{2}-\d{2}$/;
  if (!isDay.test(p.start) || !isDay.test(p.end) || p.start > p.end) {
    return fail('start and end must be days YYYY-MM-DD, start not after end');
  }
  if (p.start < FIRST_DAY) {
    return fail('days before ' + FIRST_DAY + ' are month files: not fetched');
  }
  days = dayList(p.start, p.end);
  if (days.length > MAX_DAYS) {
    return fail('a backfill takes ' + MAX_DAYS + ' days at most');
  }
} else {
  var today = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  days = dayList(
    new Date(today - DAYS_BACK * 86400000).toISOString().slice(0, 10),
    new Date(today - 86400000).toISOString().slice(0, 10)
  ).filter(function (day) {
    return day >= FIRST_DAY;
  });
}
if (!days.length) {
  node.status({
    fill: 'grey',
    shape: 'ring',
    text: 'no day on or after ' + FIRST_DAY
  });
  return null;
}

var cfg = Object.assign({}, shared);
cfg.dryRun = DRY_RUN;
cfg.bodyFolder = shared.root + '/' + IN_BODIES;
cfg.sourceFolder = shared.root + '/' + OUT_SOURCE;
flow.set('cfg', cfg);

// One task per day, site and type, the days in order.
var tasks = [];
days.forEach(function (day) {
  sites.forEach(function (site) {
    TYPES.forEach(function (type) {
      tasks.push({
        site: site,
        type: type,
        day: day
      });
    });
  });
});
var runId = new Date().toISOString();
flow.set('fetchRun', {
  id: runId,
  sites: sites,
  days: days,
  expected: tasks.length,
  done: 0
});
glob.set('runStatus_' + FLOW, {
  flow: FLOW,
  state: 'running',
  source: backfill ? 'backfill' : 'schedule',
  dryRun: DRY_RUN,
  startedAt: runId,
  lastBeatAt: runId,
  job: {
    sites: sites.join(', '),
    days: days[0] + ' to ' + days[days.length - 1]
  },
  lastLog: ''
});

node.status({
  fill: DRY_RUN ? 'yellow' : 'green',
  shape: 'dot',
  text: tasks.length + ' calls' + (DRY_RUN ? ', DRY RUN' : '')
});
msg.payload = tasks;
return msg;
