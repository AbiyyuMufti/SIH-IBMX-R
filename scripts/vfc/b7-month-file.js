// Sets the month file of one type for the read node, or skips it.
// In: msg.site, msg.month (flow context have_<type>_<site>). Out 1: msg.path.
// Out 2: the file does not exist and the type is optional: an empty lookup is
// stored (flow context <KEY>_<site>_<month>) and the month goes on.
var TYPE = '__TYPE__';
var KEY = '__KEY__';
var OPTIONAL = __OPTIONAL__;
var cfg = flow.get('cfg');
var have = flow.get('have_' + TYPE + '_' + msg.site) || [];

if (have.indexOf(msg.month) === -1 && OPTIONAL) {
  flow.set(KEY + '_' + msg.site + '_' + msg.month, {});
  node.status({
    fill: 'yellow',
    shape: 'ring',
    text: msg.site + ' ' + msg.month + ': no ' + TYPE + ' file'
  });
  return [null, msg];
}
msg.path = cfg.sourceFolder + '/' + TYPE + '/site=' + msg.site + '/';
msg.path += TYPE + '_' + msg.month + '.csv';
return [msg, null];
