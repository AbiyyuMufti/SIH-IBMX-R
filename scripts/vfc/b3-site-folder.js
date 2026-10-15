// Sets the folder of one site for the list objects node.
// In: msg.payload = one site name (after the split). Out: msg.site, msg.what
// and msg.path = the reference folder of the site, ending with a slash.
var TYPE_FOLDER = 'machine_names';
var cfg = flow.get('cfg');

msg.site = msg.payload;
msg.what = 'machine names';
msg.path = cfg.referenceFolder + '/' + TYPE_FOLDER;
msg.path += '/site=' + msg.site + '/';
return msg;
