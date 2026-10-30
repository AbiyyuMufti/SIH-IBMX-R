// Sets the Format List folder of one site for the list objects node.
// In: the message of one site (msg.site stays). Out: msg.what and msg.path =
// <root>/reference/format_list/site=<Site>/, ending with a slash.
var cfg = flow.get('cfg');

msg.what = 'format list';
msg.path = cfg.referenceFolder + '/format_list/site=' + msg.site + '/';
return msg;
