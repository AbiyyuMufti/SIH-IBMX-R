// Starts the jobs of the run. In: msg.job {tables, sites} from the settings.
// Out 1: machine names, payload = the site list (a split follows). Out 2: shift
// names. Out 3: calendar. A table that is not in the job gets no message.
var job = msg.job;
var day = new Date().toISOString().slice(0, 10);
var loadedAt = Date.now();

function start(table, payload) {
  if (job.tables.indexOf(table) === -1) {
    return null;
  }
  return {
    payload: payload,
    job: job,
    table: table,
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
  start('pbi_machine_names', job.sites),
  start('pbi_shift_naming', []),
  start('pbi_calendar', [])
];
