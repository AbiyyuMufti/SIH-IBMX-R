// SITE SETTINGS of the SIH report daily tab (site name, dry run).
// In: the hourly tick (runs only in the hour sihRunHourUtc of the site in
// 1.1 CONFIG) or the backfill {start, end}. Out: msg.payload = the site name
// for the site setup, msg.trigger = the payload of the inject.
var SITE_NAME = '__SITE__';
// true = log row counts, write NO files. false = write the tables.
var DRY_RUN = true;
// Schedule: yesterday plus this many days before it.
var REBUILD_DAYS = 2;
// The source this tab builds. A line whose source (1.1 CONFIG: line
// reportSource, else site reportSource) is this one writes to <root>/report,
// any other to <root>/candidate/<source>.
var SOURCE = 'sih';

function stop(text) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: text
  });
  node.error(text);
  return null;
}

var shared = glob.get('cfg');
if (!shared) {
  return stop('global cfg is missing: deploy or run the Config tab first');
}
var matches = shared.sites.filter(function (s) {
  return s.name === SITE_NAME;
});
if (!matches.length) {
  return stop('site "' + SITE_NAME + '" is not in the CONFIG sites list');
}
var site = matches[0];
if (!site.assetIds.length) {
  return stop('site "' + SITE_NAME + '" has no lines in CONFIG');
}

var p = msg.payload;
var backfill = !!(p && typeof p === 'object' && p.start && p.end);
var hour = new Date().getUTCHours();
if (!backfill && site.sihRunHourUtc !== hour) {
  node.status({
    fill: 'grey',
    shape: 'ring',
    text: 'not due (runs at ' + site.sihRunHourUtc + ':00 UTC)'
  });
  return null;
}

var cfg = Object.assign({}, shared);
cfg.site = site.name;
cfg.dayStartHour = site.dayStartHour;
cfg.assetIds = site.assetIds;
cfg.lines = site.lines;
cfg.siteSource = site.reportSource;
cfg.dryRun = DRY_RUN;
cfg.rebuildDays = REBUILD_DAYS;
cfg.source = SOURCE;
cfg.referenceFolder = shared.root + '/reference';
cfg.liveFolder = shared.root + '/report';
cfg.candidateFolder = shared.root + '/candidate/' + SOURCE;
flow.set('cfg', cfg);

node.status({
  fill: DRY_RUN ? 'yellow' : 'green',
  shape: 'dot',
  text: SITE_NAME + (DRY_RUN ? ' DRY RUN' : ' WRITE MODE')
});
msg.trigger = p;
msg.payload = site.name;
msg.allMachines = true;
msg.day = new Date().toISOString().slice(0, 10);
msg.mode = backfill ? 'backfill' : 'schedule';
return msg;
