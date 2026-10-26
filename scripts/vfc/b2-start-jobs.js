// Starts the jobs of the run. In: msg.job {tables, sites, months}.
// Out: the site setup (Glidepaths, Machine Names, Shift Patterns), then the
// month tables of the job, for the sites of the job.
var FLOW = '__FLOW__';
var job = msg.job;
var startedAt = new Date().toISOString();

glob.set('runStatus_' + FLOW, {
  flow: FLOW,
  state: 'running',
  source: msg.topic === 'listener job' ? 'listener' : 'manual',
  startedAt: startedAt,
  lastBeatAt: startedAt,
  job: {
    tables: job.tables.join(', ').slice(0, 120),
    sites: job.sites.join(', ').slice(0, 120),
    months: job.months.length
  },
  lastLog: ''
});

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
