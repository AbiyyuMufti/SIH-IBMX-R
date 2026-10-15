// Sets the folder of the Shift Patterns file for the list objects node.
// In: the message of one site (msg.site stays). Out: msg.what and msg.path =
// eu_report/reference/shift_naming/site=All/, the file of all sites.
var cfg = flow.get('cfg');

msg.what = 'shift patterns';
msg.path = cfg.referenceFolder + '/shift_naming/site=All/';
return msg;
