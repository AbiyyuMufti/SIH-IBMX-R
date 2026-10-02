// CONFIG: the only place to edit. Runs on every trigger, then passes the message on.
var cfg = {
  // ---- output paths in the data lake (YYYY-MM-DD is replaced by the production day) ----
  paths: {
    fact_kpi: 'mufti_test/fact_kpi/fact_kpi_YYYY-MM-DD.parquet',
    fact_loss: 'mufti_test/fact_loss/fact_loss_YYYY-MM-DD.parquet'
  },
  // ---- switches ----
  dryRun: true,            // true = log row counts and first rows, write NO files. Set false to write.
  rebuildDays: 2,          // schedule: yesterday plus this many days before it
  // ---- credentials (technical user). Fill in after import. Do not share the flow with these filled in ----
  tenantName: 'reckitt',
  clientId: 'PUT_CLIENT_ID_HERE',
  clientSecret: 'PUT_CLIENT_SECRET_HERE',
  // ---- host ----
  gateway: 'https://gateway.eu1.mindsphere.io',
  // ---- assets: empty list = every configured OEE asset except the excluded ones below ----
  assetIds: [
    'cf4565d7da1e4efcbc0ea6a4814b8eee', // B2 Line (Hull)
    'bc08dae161124f1cb533199f556190b3'  // GT4 (Hull)
  ],
  excludeAncestorNames: ['Test Line'],   // skip any asset below an asset with one of these names
  excludeNames: [],
  // ---- classification of stops: first element of reasonFullPath in this list = planned ----
  plannedRoots: ['Planned Downtime', 'Planned Maintenance']
};
flow.set('cfg', cfg);
node.status({ fill: cfg.dryRun ? 'yellow' : 'green', shape: 'dot', text: cfg.dryRun ? 'DRY RUN' : 'WRITE MODE' });
return msg;
