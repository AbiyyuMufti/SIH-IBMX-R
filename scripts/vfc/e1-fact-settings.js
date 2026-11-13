// FACT SETTINGS of the tab EU OEE Fact write: dry run and the line list.
// In: one table message of a build tab (msg.table, site, month, out, rows).
// Out 1: the message with msg.path = the line list file; cfg in flow
// context. Out 2: a log line for a skipped job (MONTH_JOBS, FIRST_DAY).

// true: nothing is written, the log shows what would be written.
var DRY_RUN = true;
// The line list (Unique Machine Name, Dept, Area, Product Type): In EU
// Report of the fact = the line is in this file (as the month files).
var LINE_LIST = 'report/Dim/Machine_Names_EU.csv';
// false: a month job of a build tab (from/to) writes no fact file, because
// the month files EU_OEE_Fact_<YYYY-MM>.parquet already hold the history
// and a second file of the same days would count them twice.
var MONTH_JOBS = false;
// The first day this tab writes (the cutover): the month files hold the
// days before it (docs/eu-oee-fact-flows.md, "Cutover").
var FIRST_DAY = '2026-11-10';

var shared = glob.get('cfg');
if (!shared) {
  node.status({
    fill: 'red',
    shape: 'ring',
    text: 'CONFIG not run'
  });
  node.error('global cfg is missing: deploy or run the Config tab first');
  return [null, null];
}

var isMonth = /^\d{4}-\d{2}$/.test(msg.month);
var reason = '';
if (isMonth && !MONTH_JOBS) {
  reason = 'a month job; EU_OEE_Fact takes day jobs only (MONTH_JOBS)';
} else if (!isMonth && String(msg.month).slice(0, 10) < FIRST_DAY) {
  reason = 'before FIRST_DAY ' + FIRST_DAY + ' (the month files hold it)';
}
if (reason) {
  node.status({
    fill: 'grey',
    shape: 'ring',
    text: 'skipped ' + msg.month
  });
  var text = 'SKIPPED: ' + msg.table + ' ' + msg.site + ' ' + msg.month;
  text += ' is ' + reason;
  return [null, {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] ' + text
  }];
}

var cfg = Object.assign({}, shared);
cfg.dryRun = {
  EU_OEE_Fact: DRY_RUN
};
flow.set('cfg', cfg);

msg.path = shared.root + '/' + LINE_LIST;
node.status({
  fill: DRY_RUN ? 'yellow' : 'green',
  shape: 'dot',
  text: (DRY_RUN ? 'DRY RUN ' : 'WRITE ') + msg.site + ' ' + msg.month
});
return [msg, null];
