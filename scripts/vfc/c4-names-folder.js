// Sets the Machine Names folder of one site for the list objects node.
// In: msg.payload = one site name (after the split). Out: msg.site, msg.what
// and msg.path = <root>/reference/machine_names/site=<Site>/.
var TYPE_FOLDER = 'machine_names';
var cfg = flow.get('cfg');

msg.site = msg.payload;
msg.what = 'machine names';
msg.path = cfg.root + '/reference/' + TYPE_FOLDER;
msg.path += '/site=' + msg.site + '/';
return msg;
