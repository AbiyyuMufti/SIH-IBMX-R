// SITE SETTINGS of the shift report flow: site name, dry run, rebuild days.
// In: any message from an inject node. Out: the same message.
// It reads the site from the Config tab (global context), copies the
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
if (site.timeZone !== 'Europe/London') {
  return stop(
    'time zone not supported',
    'timeZone "' + site.timeZone + '" is not supported, only Europe/London'
  );
}
// The clock change happens at 01:00 UTC, so a start before 02:00 local
// would need another rule.
var start = site.dayStartLocal;
if (!(start >= 2 && start <= 23 && start % 1 === 0)) {
  return stop(
    'bad dayStartLocal',
    'dayStartLocal must be a whole hour from 2 to 23, got ' + start
  );
}

var cfg = Object.assign({}, shared);
cfg.site = site.name;
cfg.dayStartLocal = start;
cfg.timeZone = site.timeZone;
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
