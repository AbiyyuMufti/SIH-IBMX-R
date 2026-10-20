// Starts the jobs of the run. In: msg.job {tables, sites, months}.
// Out: the site setup (Glidepaths, Machine Names, Shift Patterns), then the
// month tables of the job, for the sites of the job.
var job = msg.job;

node.status({
  fill: 'green',
  shape: 'dot',
  text: job.tables.length + ' table(s), ' + job.sites.length + ' site(s)'
});
return {
  payload: job.sites,
  job: job,
  day: new Date().toISOString().slice(0, 10),
  mode: 'report',
  loadedAt: Date.now()
};
