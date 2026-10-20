// TASK SETTINGS of the PBI report build: folders, sites, months, dry run.
// In: msg.payload = the job {tables, sites, from, to}; all optional (months
// YYYY-MM, default last month and this month). Out: msg.job, settings stored.

// The source this flow builds. A site whose reportSource (1.1 CONFIG) is
// this one writes to <root>/report, any other to <root>/candidate/<source>.
var SOURCE = 'provideam';
// Folders below the root folder of 1.1 CONFIG, without a leading slash.
var IN_REFERENCE = 'reference';
var IN_SOURCE = 'pbi_report/source';
var OUT_LIVE = 'report';
var OUT_CANDIDATE = 'candidate/' + SOURCE;
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
// The sites of 1.1 CONFIG.
var ALL_SITES = shared.sites.map(function (site) {
  return site.name;
});

function fail(text) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: text
  });
  node.error(text);
  return null;
}

// Months from the first to the last one, both as YYYY-MM.
function monthList(from, to) {
  var out = [];
  var year = Number(from.slice(0, 4));
  var month = Number(from.slice(5, 7));
  var last = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  while (year * 12 + month <= last) {
    out.push(year + '-' + (month < 10 ? '0' + month : month));
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return out;
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
  return fail('unknown table or site in the job: ' + unknown.join(', '));
}

var now = new Date();
var thisMonth = now.toISOString().slice(0, 7);
var lastMonth = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
);
var from = asked.from || lastMonth.toISOString().slice(0, 7);
var to = asked.to || thisMonth;
if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to) || from > to) {
  return fail('from and to must be months YYYY-MM, from not after to');
}

var cfg = Object.assign({}, shared);
cfg.dryRun = DRY_RUN;
cfg.referenceFolder = shared.root + '/' + IN_REFERENCE;
cfg.sourceFolder = shared.root + '/' + IN_SOURCE;
cfg.allSites = ALL_SITES;
cfg.source = SOURCE;
// The output folder of each site, from its reportSource.
cfg.siteOut = {};
shared.sites.forEach(function (site) {
  var live = site.reportSource === SOURCE;
  cfg.siteOut[site.name] = shared.root + '/' +
    (live ? OUT_LIVE : OUT_CANDIDATE);
});
cfg.calendarStart = CALENDAR_START;
cfg.calendarEnd = CALENDAR_END;
cfg.paths = {};
allTables.forEach(function (table) {
  cfg.paths[table] = shared.root + '/' + OUT_LIVE + '/' + table + '/' +
    table + '.parquet';
});
flow.set('cfg', cfg);

msg.job = {
  tables: tables,
  sites: sites,
  months: monthList(from, to)
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
