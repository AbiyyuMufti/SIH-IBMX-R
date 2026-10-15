// Sets the plan OPT folder of the site for the list objects node.
// In: the message of one site. Out: msg.what and msg.path = the month files
// folder eu_report/pbi_report/source/plan_opt/site=<Site>/.
var cfg = flow.get('cfg');

msg.what = 'plan opt';
msg.filePrefix = 'plan_opt';
msg.path = cfg.sourceFolder + '/plan_opt/site=' + msg.site + '/';
return msg;
