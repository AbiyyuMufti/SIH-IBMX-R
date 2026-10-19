// CONFIG: the shared settings of ALL flows. Edit here only.
// In: any message from an inject (on deploy, or the Apply button).
// Out: nothing. The settings go to global context: glob.get('cfg').
var cfg = {
  // Root folder in the data lake. Every table gets its own subfolder.
  root: 'mufti_test',
  // Platform: 'legacy' = old Insights Hub (gateway.eu1.mindsphere.io),
  // 'xcelerator' = new platform (api.eu1.siemens.app). No default: set one.
  platform: 'SET_legacy_OR_xcelerator',
  // Technical user. Fill in after import. Do not share the flow filled in.
  // tenantName is used by legacy only, xcTenantId (10 digits) by xcelerator.
  tenantName: 'reckitt',
  xcTenantId: 'PUT_TENANT_ID_HERE',
  clientId: 'PUT_CLIENT_ID_HERE',
  clientSecret: 'PUT_CLIENT_SECRET_HERE',
  // One entry per site: the assets to read and the first hour (UTC) of its
  // production day. A site flow needs a non-empty assetIds list.
  // The shift report flow uses a local production day instead:
  // dayStartLocal (hour of the local clock) in timeZone, and the lines in
  // reportLineIds. Only the timeZone Europe/London is supported so far.
  sites: [
    {
      name: 'Hull',
      dayStartHour: 6,
      dayStartLocal: 6,
      timeZone: 'Europe/London',
      assetIds: [
        // B2 Line
        'cf4565d7da1e4efcbc0ea6a4814b8eee',
        // GT4
        'bc08dae161124f1cb533199f556190b3'
      ],
      reportLineIds: [
        // B2 Line
        'cf4565d7da1e4efcbc0ea6a4814b8eee'
      ]
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
