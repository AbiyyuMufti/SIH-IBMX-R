// CONFIG: the shared settings of ALL flows. Edit here only.
// In: any message from an inject (on deploy, or the Apply button).
// Out: nothing. The settings go to global context: global.get('cfg').
var cfg = {
  // Root folder in the data lake. Every table gets its own subfolder.
  root: 'mufti_test',
  // Technical user. Fill in after import. Do not share the flow filled in.
  tenantName: 'reckitt',
  clientId: 'PUT_CLIENT_ID_HERE',
  clientSecret: 'PUT_CLIENT_SECRET_HERE',
  gateway: 'https://gateway.eu1.mindsphere.io',
  // One entry per site: the assets to read and the first hour (UTC) of its
  // production day. All empty asset lists = every configured OEE asset.
  sites: [
    {
      name: 'Hull',
      dayStartHour: 6,
      assetIds: [
        // B2 Line
        'cf4565d7da1e4efcbc0ea6a4814b8eee',
        // GT4
        'bc08dae161124f1cb533199f556190b3'
      ]
    }
  ],
  // Skip any asset with one of these names.
  excludeNames: [],
  // Skip any asset below an asset with one of these names.
  excludeAncestorNames: ['Test Line'],
  // Reference flow: calendar events are read for this many days.
  calendarWindowDays: 31
};
global.set('cfg', cfg);
node.status({
  fill: 'green',
  shape: 'dot',
  text: cfg.sites.length + ' site(s) stored'
});
return null;
