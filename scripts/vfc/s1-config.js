// CONFIG: the only node to edit. It runs on every trigger.
// In: any message from an inject node. Out: the same message.
// The settings are stored in flow context (flow.get('cfg')).
var cfg = {
  // Output paths in the data lake. YYYY-MM-DD becomes the production day.
  paths: {
    fact_kpi: 'mufti_test/fact_kpi/fact_kpi_YYYY-MM-DD.parquet',
    fact_loss: 'mufti_test/fact_loss/fact_loss_YYYY-MM-DD.parquet'
  },
  // true = log row counts and first rows, write NO files. false = write.
  dryRun: true,
  // Schedule: yesterday plus this many days before it.
  rebuildDays: 2,
  // Technical user. Fill in after import. Do not share the flow filled in.
  tenantName: 'reckitt',
  clientId: 'PUT_CLIENT_ID_HERE',
  clientSecret: 'PUT_CLIENT_SECRET_HERE',
  gateway: 'https://gateway.eu1.mindsphere.io',
  // Assets to read. An empty list = every configured OEE asset except the
  // excluded ones below.
  assetIds: [
    // B2 Line (Hull)
    'cf4565d7da1e4efcbc0ea6a4814b8eee',
    // GT4 (Hull)
    'bc08dae161124f1cb533199f556190b3'
  ],
  // Skip any asset below an asset with one of these names.
  excludeAncestorNames: ['Test Line'],
  excludeNames: [],
  // A stop is planned when the first part of its reason path is in this list.
  plannedRoots: ['Planned Downtime', 'Planned Maintenance']
};
flow.set('cfg', cfg);
node.status({
  fill: cfg.dryRun ? 'yellow' : 'green',
  shape: 'dot',
  text: cfg.dryRun ? 'DRY RUN' : 'WRITE MODE'
});
return msg;
