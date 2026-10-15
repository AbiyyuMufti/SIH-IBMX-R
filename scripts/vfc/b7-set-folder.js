// Sets the folder of one file type of the site for the list objects node.
// In: the site message (msg.site). Out: msg.what, msg.filePrefix and msg.path
// = <root>/<type>/site=<Site>/ (the reference or the source folder).
var TYPE = '__TYPE__';
var ROOT = '__ROOT__';
var cfg = flow.get('cfg');

msg.what = TYPE;
msg.filePrefix = TYPE;
msg.path = cfg[ROOT] + '/' + TYPE + '/site=' + msg.site + '/';
return msg;
