// Sends a site on after its Glidepaths and shift lookups are stored.
// In: the site message, msg.job.tables. Out 1: plan OPT and time utilisation
// months. Out 2: daily losses (equipment lookup, then the months).
var tables = msg.job.tables;
var wantsPlan = tables.indexOf('Plan_OPT_EU') !== -1 ||
  tables.indexOf('Time_Utilisation_EU') !== -1;
var wantsLosses = tables.indexOf('Daily_Losses_EU') !== -1;

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
