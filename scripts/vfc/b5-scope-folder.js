// Sets the folder of the report scope file for the list objects node.
// In: the message of one site (msg.site stays). Out: msg.what and msg.path =
// <root>/reference/report_scope/site=All/, one file for all sites.
var cfg = flow.get('cfg');

msg.what = 'report scope';
msg.path = cfg.referenceFolder + '/report_scope/site=All/';
return msg;
