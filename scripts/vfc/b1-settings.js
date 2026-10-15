// TASK SETTINGS of the PBI report build: folders, sites, dry run, calendar.
// In: msg.payload = the job {tables: [...], sites: [...]}. Both are optional,
// no list means all. Out: the same message with msg.job, the settings stored.
// Folders in the data lake, without a leading slash.
var IN_REFERENCE = 'eu_report/reference';
var OUT_ROOT = 'eu_report/pbi_report/report';
// Sites that have files in the data lake.
var ALL_SITES = [
  'Hull',
  'Nottingham',
  'Weinheim'
];
var DRY_RUN = {
__DRY_RUN__
};
// First and last date of the calendar table (the report uses 2011 to 2050).
var CALENDAR_START = '2011-01-01';
var CALENDAR_END = '2050-12-31';

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

var asked = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
var allTables = Object.keys(DRY_RUN);
var tables = Array.isArray(asked.tables) ? asked.tables : allTables;
var sites = Array.isArray(asked.sites) ? asked.sites : ALL_SITES;
var unknown = tables.filter(function (t) {
  return allTables.indexOf(t) === -1;
}).concat(sites.filter(function (s) {
  return ALL_SITES.indexOf(s) === -1;
}));
if (unknown.length) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'unknown: ' + unknown.join(', ')
  });
  node.error('unknown table or site in the job: ' + unknown.join(', '));
  return null;
}

var cfg = Object.assign({}, shared);
cfg.dryRun = DRY_RUN;
cfg.referenceFolder = IN_REFERENCE;
cfg.calendarStart = CALENDAR_START;
cfg.calendarEnd = CALENDAR_END;
cfg.paths = {};
allTables.forEach(function (table) {
  cfg.paths[table] = OUT_ROOT + '/' + table + '/' + table + '.parquet';
});
flow.set('cfg', cfg);

msg.job = {
  tables: tables,
  sites: sites
};
var writing = tables.filter(function (table) {
  return !DRY_RUN[table];
});
node.status({
  fill: writing.length ? 'green' : 'yellow',
  shape: 'dot',
  text: writing.length ? writing.length + ' table(s) WRITE' : 'DRY RUN'
});
return msg;
