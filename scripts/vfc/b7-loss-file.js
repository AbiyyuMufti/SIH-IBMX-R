// Sets the line loss month file for the read node.
// In: msg.site, msg.month (the month exists: it was chosen from the list).
// Out: msg.path = <source>/line_losses/site=<Site>/line_losses_<YYYY-MM>.csv.
var cfg = flow.get('cfg');

msg.path = cfg.sourceFolder + '/line_losses/site=' + msg.site + '/';
msg.path += 'line_losses_' + msg.month + '.csv';
return msg;
