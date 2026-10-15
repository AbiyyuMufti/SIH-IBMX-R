// Sends a site on after its Glidepaths and shift lookups are stored.
// In: the site message, msg.job.tables. Out 1: plan OPT and time utilisation
// months. Out 2: daily losses (equipment lookup, then the months).
var tables = msg.job.tables;
var wantsPlan = tables.indexOf('pbi_plan_opt') !== -1 ||
  tables.indexOf('pbi_time_utilisation') !== -1;
var wantsLosses = tables.indexOf('pbi_daily_losses') !== -1;

node.status({
  fill: 'green',
  shape: 'dot',
  text: msg.site + ': ' + (wantsPlan ? 'plan ' : '') +
    (wantsLosses ? 'losses' : '')
});
return [
  wantsPlan ? msg : null,
  wantsLosses ? msg : null
];
