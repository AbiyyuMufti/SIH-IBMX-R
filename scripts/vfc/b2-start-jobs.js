// Starts the jobs of the run. In: msg.job {tables, sites, months}.
// Out 1: machine names (payload = the site list, a split follows). Out 2: shift
// names. Out 3: calendar. Out 4: plan OPT and time utilisation (site list).
// A table that is not in the job gets no message.
var job = msg.job;
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
  start(wants('pbi_machine_names'), job.sites),
  start(wants('pbi_shift_naming'), []),
  start(wants('pbi_calendar'), []),
  start(wants('pbi_plan_opt') || wants('pbi_time_utilisation'), job.sites)
];
