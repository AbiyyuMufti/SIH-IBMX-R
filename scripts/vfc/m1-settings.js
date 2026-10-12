// TASK SETTINGS: the settings of this flow only (dry run per table).
// In: any message from an inject node. Out: the same message.
// It copies the shared settings from global context into flow context and
// builds the file path of every table.
var DRY_RUN = {
__DRY_RUN__
};
// First and last date of the calendar table.
var CALENDAR_START = '2026-09-01';
var CALENDAR_END = '2026-12-31';

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

var cfg = Object.assign({}, shared);
cfg.dryRun = DRY_RUN;
cfg.calendarStart = CALENDAR_START;
cfg.calendarEnd = CALENDAR_END;
cfg.paths = {};
Object.keys(DRY_RUN).forEach(function (table) {
  cfg.paths[table] = shared.root + '/' + table + '/' + table + '.parquet';
});
cfg.assetIds = [];
shared.sites.forEach(function (site) {
  cfg.assetIds = cfg.assetIds.concat(site.assetIds);
});
flow.set('cfg', cfg);

var writing = Object.keys(DRY_RUN).filter(function (table) {
  return !DRY_RUN[table];
});
node.status({
  fill: writing.length ? 'green' : 'yellow',
  shape: 'dot',
  text: writing.length ? writing.length + ' table(s) WRITE' : 'DRY RUN'
});
return msg;
