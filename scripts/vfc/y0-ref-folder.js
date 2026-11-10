// Sets the folder of one reference file type for the list objects node.
// In: msg.payload = one type (after the split). Out: msg.type, msg.site,
// msg.what and msg.path = the folder, ending with a slash.
var SITE = 'Chartres';
var FOLDERS = {
  machines: 'machine_names/site=Chartres/',
  glidepaths: 'glidepaths/site=Chartres/',
  formats: 'format_list/site=Chartres/',
  scope: 'report_scope/site=All/',
  losses: 'localisation/site=Chartres/'
};
var cfg = flow.get('cfg');

msg.type = msg.payload;
msg.site = SITE;
msg.what = msg.type;
msg.path = cfg.referenceFolder + '/' + FOLDERS[msg.type];
return msg;
