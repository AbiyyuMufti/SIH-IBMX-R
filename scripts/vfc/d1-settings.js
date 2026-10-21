// SITE SETTINGS of the SIH report daily tab (site name, dry run).
// In: the hourly tick (goes on only in the local hour runHourLocal of the
// site in 1.1 CONFIG) or the backfill {start, end}. Out: msg.payload = the
// site name for the site setup, msg.trigger = the payload of the inject.
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
if (!site.timeZone || site.dayStartLocal === undefined) {
  return stop('site "' + SITE_NAME + '" needs timeZone and dayStartLocal');
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
cfg.dayStartHour = site.dayStartHour;
cfg.dayStartLocal = site.dayStartLocal;
cfg.timeZone = site.timeZone;
cfg.utcHours = site.utcHours;
cfg.euSummer = site.euSummer;
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
