// Settings of the tab Chartres live. In: a request of Power Automate (msg.req)
// or the refresh trigger. Out 1: the request. Out 2: the reference refresh.
// Edit the constants below. DRY_RUN true builds and logs the rows, writes none.
var DRY_RUN = true;
var SITE_NAME = 'Chartres';
var SOURCE = 'excel';

var shared = glob.get('cfg');
if (!shared || !shared.root) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'CONFIG not run'
  });
  node.error('CONFIG not run: open the Config tab and deploy it');
  return null;
}

var cfg = Object.assign({}, shared);
cfg.site = SITE_NAME;
cfg.source = SOURCE;
cfg.dryRun = DRY_RUN;
cfg.referenceFolder = shared.root + '/reference';
cfg.liveFolder = shared.root + '/report';
flow.set('cfg', cfg);

node.status({
  fill: DRY_RUN ? 'yellow' : 'green',
  shape: 'dot',
  text: SITE_NAME + (DRY_RUN ? ' DRY RUN' : ' WRITE MODE')
});
if (msg.req) {
  return [msg, null];
}
return [null, msg];
