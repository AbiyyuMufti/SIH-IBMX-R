// POWER BI SETTINGS: the settings of this flow only (site, dry run).
// In: any message from an inject node. Out: the same message.
// It reads the site from the Config tab and builds the file paths.
var SITE_NAME = '__SITE__';
// true = log row counts, write NO files. false = write the tables.
var DRY_RUN = true;
// Schedule: yesterday plus this many days before it.
var REBUILD_DAYS = 2;
// Folder prefix of the site folder: fact_kpi/<prefix><site>/...
var FOLDER_PREFIX = 'site=';
// First and last date of the calendar table.
var CALENDAR_START = '2025-01-01';
var CALENDAR_END = '2027-12-31';

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

var cfg = Object.assign({}, shared);
cfg.site = site.name;
cfg.dayStartHour = site.dayStartHour;
cfg.dryRun = DRY_RUN;
cfg.rebuildDays = REBUILD_DAYS;
cfg.calendarStart = CALENDAR_START;
cfg.calendarEnd = CALENDAR_END;

var root = shared.root;
var folder = FOLDER_PREFIX + site.name;
// YYYY-MM-DD becomes the production day.
cfg.paths = {
  dim_asset: root + '/dim_asset/dim_asset.parquet',
  dim_shift: root + '/dim_shift/dim_shift.parquet',
  fact_kpi: root + '/fact_kpi/' + folder + '/fact_kpi_YYYY-MM-DD.parquet',
  fact_loss: root + '/fact_loss/' + folder + '/fact_loss_YYYY-MM-DD.parquet',
  pbi_plan_opt: root + '/pbi_plan_opt/' + folder +
    '/pbi_plan_opt_YYYY-MM-DD.parquet',
  pbi_time_utilisation: root + '/pbi_time_utilisation/' + folder +
    '/pbi_time_utilisation_YYYY-MM-DD.parquet',
  pbi_daily_losses: root + '/pbi_daily_losses/' + folder +
    '/pbi_daily_losses_YYYY-MM-DD.parquet',
  pbi_machine_names: root + '/pbi_machine_names/' + folder +
    '/pbi_machine_names.parquet',
  pbi_shift_naming: root + '/pbi_shift_naming/' + folder +
    '/pbi_shift_naming.parquet',
  pbi_calendar: root + '/pbi_calendar/pbi_calendar.parquet'
};
flow.set('cfg', cfg);

node.status({
  fill: DRY_RUN ? 'yellow' : 'green',
  shape: 'dot',
  text: SITE_NAME + (DRY_RUN ? ' DRY RUN' : ' WRITE MODE')
});
return msg;
