// Starts the jobs of the run. In: msg.job {tables, sites, months}. Out 1:
// machine names (always ALL sites: one file for all of them). Out 2: shift
// names. Out 3: calendar. Out 4: the site setup (plan OPT, time utilisation,
// daily losses) for the sites of the job. A table not in the job: no message.
var job = msg.job;
var cfg = flow.get('cfg');
var day = new Date().toISOString().slice(0, 10);
var loadedAt = Date.now();

function wants(table) {
  return job.tables.indexOf(table) !== -1;
}

function start(wanted, payload) {
  if (!wanted) {
    return null;
  }
  return {
    payload: payload,
    job: job,
    day: day,
    mode: 'report',
    loadedAt: loadedAt
  };
}

node.status({
  fill: 'green',
  shape: 'dot',
  text: job.tables.length + ' table(s), ' + job.sites.length + ' site(s)'
});
return [
  start(wants('pbi_machine_names'), cfg.allSites),
  start(wants('pbi_shift_naming'), []),
  start(wants('pbi_calendar'), []),
  start(wants('pbi_plan_opt') || wants('pbi_time_utilisation') ||
    wants('pbi_daily_losses'), job.sites)
];
