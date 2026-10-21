// SITE SETTINGS of the shift report flow: site name, dry run, rebuild days.
// In: the hourly tick (goes on only in the local hour runHourLocal of the
// site in 1.1 CONFIG) or the backfill. Out: the same message. Copies the
// shared settings into flow context and builds the three table paths.
var SITE_NAME = '__SITE__';
// true = log row counts, write NO files. false = write the tables.
var DRY_RUN = true;
// Schedule: yesterday plus this many days before it.
var REBUILD_DAYS = 2;
// Folder under the root that holds the rpt_ tables, and the site folder
// prefix: <root>/shift_report/rpt_hour/site=<site>/...
var REPORT_FOLDER = 'shift_report';
var FOLDER_PREFIX = 'site=';

function stop(statusText, errorText) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: statusText
  });
  node.error(errorText);
  return null;
}

var shared = glob.get('cfg');
if (!shared) {
  return stop(
    'CONFIG not run',
    'global cfg is missing: deploy or run the Config tab first'
  );
}
var matches = shared.sites.filter(function (s) {
  return s.name === SITE_NAME;
});
if (!matches.length) {
  return stop(
    'site not in CONFIG',
    'site "' + SITE_NAME + '" is not in the CONFIG sites list'
  );
}
var site = matches[0];
if (!site.reportLineIds || !site.reportLineIds.length) {
  return stop(
    'no report lines',
    'site "' + SITE_NAME + '" has no reportLineIds in CONFIG'
  );
}
// 1.1 CONFIG checks the zone (TIME_ZONES) and the day start (4 to 23).
var start = site.dayStartLocal;
if (!site.timeZone || start === undefined) {
  return stop(
    'no timeZone or dayStartLocal',
    'site "' + SITE_NAME + '" needs timeZone and dayStartLocal in CONFIG'
  );
}

// Last Sunday of the month at 01:00 UTC. The month is 0-based.
function lastSundayUtc(year, monthIndex) {
  var d = new Date(Date.UTC(year, monthIndex + 1, 0, 1, 0, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}

// Local hour of the site now: standard offset plus EU summer time.
function localHour(ms) {
  var year = new Date(ms).getUTCFullYear();
  var summer = site.euSummer && ms >= lastSundayUtc(year, 2) &&
    ms < lastSundayUtc(year, 9);
  var offset = site.utcHours + (summer ? 1 : 0);
  return new Date(ms + offset * 3600000).getUTCHours();
}

var p = msg.payload;
var backfill = !!(p && typeof p === 'object' && p.start && p.end);
if (!backfill && site.runHourLocal !== localHour(Date.now())) {
  node.status({
    fill: 'grey',
    shape: 'ring',
    text: 'not due (runs at ' + site.runHourLocal + ':00 local)'
  });
  return null;
}

var cfg = Object.assign({}, shared);
cfg.site = site.name;
cfg.dayStartLocal = start;
cfg.timeZone = site.timeZone;
cfg.utcHours = site.utcHours;
cfg.euSummer = site.euSummer;
cfg.assetIds = site.reportLineIds;
cfg.excludeMachineNames = site.reportExcludeNames || [];
cfg.dryRun = DRY_RUN;
cfg.rebuildDays = REBUILD_DAYS;
var folder = FOLDER_PREFIX + site.name;
var base = shared.root + '/' + REPORT_FOLDER;
// YYYY-MM-DD becomes the production day.
cfg.paths = {
  rpt_window: base + '/rpt_window/' + folder +
    '/rpt_window_YYYY-MM-DD.parquet',
  rpt_hour: base + '/rpt_hour/' + folder +
    '/rpt_hour_YYYY-MM-DD.parquet',
  rpt_event: base + '/rpt_event/' + folder +
    '/rpt_event_YYYY-MM-DD.parquet'
};
flow.set('cfg', cfg);

node.status({
  fill: DRY_RUN ? 'yellow' : 'green',
  shape: 'dot',
  text: SITE_NAME + (DRY_RUN ? ' DRY RUN' : ' WRITE MODE')
});
return msg;
