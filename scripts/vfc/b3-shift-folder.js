// Sets the folder of the shift patterns file for the list objects node.
// In: the shift names job. Out: msg.site, msg.what and msg.path = the folder.
// The file has no site column, so it lives in the folder site=All.
var TYPE_FOLDER = 'shift_naming';
var SITE = 'All';
var cfg = flow.get('cfg');

msg.site = SITE;
msg.what = 'shift patterns';
msg.path = cfg.referenceFolder + '/' + TYPE_FOLDER;
msg.path += '/site=' + SITE + '/';
return msg;
