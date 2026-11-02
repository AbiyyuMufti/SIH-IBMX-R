// Sets the report body file of one task for the read node.
// In: msg.payload = one task {site, type, day} (after the split). Out:
// msg.task and msg.path = <root>/reference/provideam_reports/site=<Site>/
// <type>.json (the body and the settings of the Provideam report).
var cfg = flow.get('cfg');

msg.task = msg.payload;
msg.path = cfg.bodyFolder + '/site=' + msg.task.site + '/';
msg.path += msg.task.type + '.json';
delete msg.payload;
delete msg.parts;
return msg;
