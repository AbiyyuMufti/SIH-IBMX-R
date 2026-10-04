// SITE SETTINGS: the settings of this flow only (site name, dry run).
// In: any message from an inject node. Out: the same message.
// It reads the site from the Config tab (global context) and copies the
// shared settings into flow context.
var SITE_NAME = '__SITE__';
// true = log row counts and first rows, write NO files. false = write.
var DRY_RUN = true;
// Schedule: yesterday plus this many days before it.
var REBUILD_DAYS = 2;

var shared = glob.get('cfg');
if (!shared) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'CONFIG not run'
  });
  node.error('global cfg is missing: deploy or run the Config tab first');
  return null;
}
var matches = shared.sites.filter(function (s) {
  return s.name === SITE_NAME;
});
if (!matches.length) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'site not in CONFIG'
  });
  node.error('site "' + SITE_NAME + '" is not in the CONFIG sites list');
  return null;
}
var site = matches[0];
if (!site.assetIds.length) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'no assets'
  });
  node.error('site "' + SITE_NAME + '" has no assetIds in CONFIG');
  return null;
}

var cfg = Object.assign({}, shared);
cfg.site = site.name;
cfg.dayStartHour = site.dayStartHour;
cfg.assetIds = site.assetIds;
cfg.dryRun = DRY_RUN;
cfg.rebuildDays = REBUILD_DAYS;
// YYYY-MM-DD becomes the production day.
cfg.paths = {
  fact_kpi: shared.root + '/fact_kpi/' + site.name +
    '/fact_kpi_YYYY-MM-DD.parquet',
  fact_loss: shared.root + '/fact_loss/' + site.name +
    '/fact_loss_YYYY-MM-DD.parquet'
};
flow.set('cfg', cfg);

node.status({
  fill: DRY_RUN ? 'yellow' : 'green',
  shape: 'dot',
  text: SITE_NAME + (DRY_RUN ? ' DRY RUN' : ' WRITE MODE')
});
return msg;
