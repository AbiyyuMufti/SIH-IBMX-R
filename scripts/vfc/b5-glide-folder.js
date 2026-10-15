// Sets the Glidepaths folder of one site for the list objects node.
// In: msg.payload = one site name (after the split). Out: msg.site, msg.what
// and msg.path = the reference folder of the site, ending with a slash.
var cfg = flow.get('cfg');

msg.site = msg.payload;
msg.what = 'glidepaths';
msg.path = cfg.referenceFolder + '/glidepaths/site=' + msg.site + '/';
return msg;
