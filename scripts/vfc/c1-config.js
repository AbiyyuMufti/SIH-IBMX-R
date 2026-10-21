// CONFIG: the shared settings of ALL flows. Edit here only.
// In: any message from an inject (on deploy, or the Apply button).
// Out: nothing. The settings go to global context: glob.get('cfg').
var cfg = {
  // Root folder in the data lake. Every flow writes below it:
  // reference/, pbi_report/source/, report/, candidate/, logs/.
  root: 'eu_report',
  // Platform: 'legacy' = old Insights Hub (gateway.eu1.mindsphere.io),
  // 'xcelerator' = new platform (api.eu1.siemens.app). No default: set one.
  platform: 'SET_legacy_OR_xcelerator',
  // Technical user. Fill in after import. Do not share the flow filled in.
  // tenantName is used by legacy only, xcTenantId (10 digits) by xcelerator.
  tenantName: 'reckitt',
  xcTenantId: 'PUT_TENANT_ID_HERE',
  clientId: 'PUT_CLIENT_ID_HERE',
  clientSecret: 'PUT_CLIENT_SECRET_HERE',
  // One entry per site of the report.
  // reportSource: where the report rows of the site come from,
  // 'provideam' (SharePoint files) or 'sih' (Insights Hub API). The other
  // source writes to candidate/ for comparison.
  // dayStartHour: first hour (UTC) of the production day (daily flow).
  // sihRunHourUtc: optional, the hour (UTC, 0 to 23) the SIH report daily
  // tab of the site runs; without it the tab runs only by its backfill.
  // dayStartLocal and timeZone: the local production day (shift report);
  // only Europe/London is supported so far.
  // lines: the Insights Hub lines of the site. Get id and sih from the
  // asset list (stage 2 of this tab, button "List SIH assets").
  //   id: the asset id (the flows only use this)
  //   sih: the name in Insights Hub (a label, checked against the asset)
  //   report: the MachineName of this line in the report and in the
  //     machine names file of the site (the asset list checks it)
  //   reportSource: optional, overrides the site for this line
  //   shiftReport: optional, the shift report flow builds the line if true
  // reportExcludeNames: machines below a shift report line to leave out.
  sites: [
    {
      name: 'Hull',
      reportSource: 'provideam',
      dayStartHour: 6,
      sihRunHourUtc: 7,
      dayStartLocal: 6,
      timeZone: 'Europe/London',
      lines: [
        {
          id: 'cf4565d7da1e4efcbc0ea6a4814b8eee',
          sih: 'B2 Line',
          report: 'B2 Auto',
          shiftReport: true
        },
        {
          id: 'bc08dae161124f1cb533199f556190b3',
          sih: 'GT4',
          report: 'GT4'
        }
      ],
      reportExcludeNames: [
        // '05 Antares'
      ]
    },
    {
      name: 'Nottingham',
      reportSource: 'provideam',
      lines: []
    },
    {
      name: 'Weinheim',
      reportSource: 'provideam',
      lines: []
    }
  ],
  // Skip any asset with one of these names.
  excludeNames: [],
  // Skip any asset below an asset with one of these names.
  excludeAncestorNames: ['Test Line'],
  // A stop is planned when the first part of its reason path is in this list.
  plannedRoots: ['Planned Downtime', 'Planned Maintenance'],
  // Reference flow: calendar events are read for this many days.
  calendarWindowDays: 31
};

// Addresses of the platform. Every request node uses tokenUrl, oeeBase and
// amBase from here, so one switch moves all flows. Do not edit below.
var XC_SUFFIX = '1000001700';
var SOURCES = ['provideam', 'sih'];
var problem = '';
if (cfg.platform === 'legacy') {
  var legacyHost = 'https://gateway.eu1.mindsphere.io/api/';
  cfg.tokenUrl = 'https://' + cfg.tenantName + '.piam.eu1.mindsphere.io';
  cfg.tokenUrl += '/oauth/token?grant_type=client_credentials';
  cfg.tokenForm = false;
  cfg.oeeBase = legacyHost + 'oee/v3';
  cfg.amBase = legacyHost + 'assetmanagement/v3';
} else if (cfg.platform === 'xcelerator') {
  var xcHost = 'https://api.eu1.siemens.app/api/';
  cfg.tokenUrl = 'https://' + cfg.xcTenantId;
  cfg.tokenUrl += '.eu1.sws.siemens.com/oauth/token';
  cfg.tokenForm = true;
  cfg.oeeBase = xcHost + 'oee-' + XC_SUFFIX + '/v3';
  cfg.amBase = xcHost + 'assetmanagement-' + XC_SUFFIX + '/v3';
  if (!/^[0-9]{10}$/.test(cfg.xcTenantId)) {
    problem = 'xcTenantId must be the 10-digit tenant ID';
  }
} else {
  problem = 'platform must be legacy or xcelerator';
}

// Checks one line of a site. Returns a problem text or ''.
function lineProblem(site, line, seen) {
  var where = site.name + ' line ' + (line.sih || line.id);
  if (!/^[0-9a-f]{32}$/.test(String(line.id))) {
    return where + ': id must be the 32 character asset id';
  }
  if (seen[line.id]) {
    return where + ': id is listed twice';
  }
  seen[line.id] = true;
  if (!line.sih) {
    return where + ': sih (the Insights Hub name) is missing';
  }
  if (!line.report || line.report === '?') {
    return where + ': report (the MachineName in the report) is missing';
  }
  if (line.reportSource && SOURCES.indexOf(line.reportSource) === -1) {
    return where + ': reportSource must be provideam or sih';
  }
  return '';
}

// Checks the sites and adds the lists the flows read: assetIds (all
// lines) and reportLineIds (the shift report lines).
var seenIds = {};
cfg.sites.forEach(function (site) {
  if (problem) {
    return;
  }
  if (SOURCES.indexOf(site.reportSource) === -1) {
    problem = site.name + ': reportSource must be provideam or sih';
    return;
  }
  var hour = site.sihRunHourUtc;
  var hourOk = Number.isInteger(hour) && hour >= 0 && hour <= 23;
  if (hour !== undefined && !hourOk) {
    problem = site.name + ': sihRunHourUtc must be a whole hour 0 to 23';
    return;
  }
  site.lines = site.lines || [];
  site.lines.forEach(function (line) {
    if (!problem) {
      problem = lineProblem(site, line, seenIds);
    }
  });
  site.assetIds = site.lines.map(function (line) {
    return line.id;
  });
  site.reportLineIds = site.lines.filter(function (line) {
    return line.shiftReport === true;
  }).map(function (line) {
    return line.id;
  });
});

if (problem) {
  // Clear old settings so no flow runs on a setting from an earlier deploy.
  glob.set('cfg', undefined);
  node.status({
    fill: 'red',
    shape: 'ring',
    text: problem
  });
  node.error('CONFIG not stored: ' + problem);
  return null;
}
glob.set('cfg', cfg);
node.status({
  fill: 'green',
  shape: 'dot',
  text: cfg.platform + ', ' + cfg.sites.length + ' site(s) stored'
});
return null;
