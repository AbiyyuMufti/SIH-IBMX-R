// Runs on the clock. Takes the entries of flow context "pending" whose wait
// window is over and turns them into jobs {tables, sites, from, to}. The jobs
// go to global context "jobQueue" (the tab PBI report build takes them one by
// one). Out: one log line per job (for a debug node).
var SOURCE_WAIT_S = 120;
var REFERENCE_WAIT_S = 300;
// Months before the current month that a reference change rebuilds.
var REFERENCE_MONTHS_BACK = 3;
var MONTH_TABLES = [
  'Plan_OPT_EU',
  'Time_Utilisation_EU',
  'Daily_Losses_EU'
];
var TABLES_OF = {
  plan_opt: MONTH_TABLES,
  line_losses: ['Daily_Losses_EU'],
  volume_loss_correction: ['Daily_Losses_EU'],
  machine_names: MONTH_TABLES,
  shift_naming: MONTH_TABLES,
  glidepaths: MONTH_TABLES,
  equipment_coding: ['Daily_Losses_EU']
};

var pending = flow.get('pending') || {};
var now = Date.now();
var day = new Date(now).toISOString().slice(0, 10);
var queue = glob.get('jobQueue') || [];
var lastQueuedJob = null;
var added = 0;
var logs = [];
var sourceGroups = {};

function monthIndex(text) {
  return Number(text.slice(0, 4)) * 12 + Number(text.slice(5, 7)) - 1;
}

function monthText(index) {
  var year = Math.floor(index / 12);
  var month = (index % 12) + 1;
  return year + '-' + (month < 10 ? '0' + month : month);
}

function addTables(list, tables) {
  tables.forEach(function (table) {
    if (list.indexOf(table) === -1) {
      list.push(table);
    }
  });
}

function addJob(job, why) {
  queue.push(job);
  lastQueuedJob = job;
  added++;
  logs.push({
    topic: 'log',
    payload: day + ' [listener] JOB ' + why + ': ' + JSON.stringify(job)
  });
}

// Source files: one group per site and set of tables; the months of a group
// that follow each other become one job.
function groupSource(entry) {
  var tables = [];
  Object.keys(entry.types).forEach(function (type) {
    addTables(tables, TABLES_OF[type]);
  });
  var key = entry.site + '|' + tables.join(',');
  sourceGroups[key] = sourceGroups[key] || {
    site: entry.site,
    tables: tables,
    months: []
  };
  sourceGroups[key].months.push(monthIndex(entry.month));
}

function referenceJob(entry) {
  var tables = TABLES_OF[entry.type];
  var job = {
    tables: tables
  };
  if (entry.site !== 'All') {
    job.sites = [entry.site];
  }
  var hasMonths = tables.some(function (table) {
    return MONTH_TABLES.indexOf(table) !== -1;
  });
  if (hasMonths) {
    var current = monthIndex(new Date(now).toISOString().slice(0, 7));
    job.from = monthText(current - REFERENCE_MONTHS_BACK);
    job.to = monthText(current);
  }
  addJob(job, entry.type + ' ' + entry.site + ' changed');
}

Object.keys(pending).forEach(function (key) {
  var entry = pending[key];
  var wait = entry.kind === 'source' ? SOURCE_WAIT_S : REFERENCE_WAIT_S;
  if (now - entry.first < wait * 1000) {
    return;
  }
  delete pending[key];
  if (entry.kind === 'source') {
    groupSource(entry);
  } else {
    referenceJob(entry);
  }
});

Object.keys(sourceGroups).forEach(function (key) {
  var group = sourceGroups[key];
  var months = group.months.sort(function (a, b) {
    return a - b;
  });
  var start = months[0];
  var last = months[0];
  months.slice(1).concat([null]).forEach(function (index) {
    if (index === last + 1) {
      last = index;
      return;
    }
    if (index === last) {
      return;
    }
    addJob({
      tables: group.tables,
      sites: [group.site],
      from: monthText(start),
      to: monthText(last)
    }, group.site + ' source files changed');
    start = index;
    last = index;
  });
});

flow.set('pending', pending);
glob.set('jobQueue', queue);
var waiting = Object.keys(pending).length;
var status = glob.get('runStatus_pbi-listener') || {};
status.flow = 'pbi-listener';
status.state = 'listening';
status.lastBeatAt = new Date(now).toISOString();
status.pendingEntries = waiting;
status.queuedJobs = queue.length;
if (lastQueuedJob) {
  status.lastQueuedJob = {
    tables: (lastQueuedJob.tables || []).join(', ').slice(0, 120),
    sites: (lastQueuedJob.sites || []).join(', ').slice(0, 120),
    from: lastQueuedJob.from || '',
    to: lastQueuedJob.to || ''
  };
}
glob.set('runStatus_pbi-listener', status);
node.status({
  fill: added ? 'green' : 'blue',
  shape: 'dot',
  text: waiting + ' waiting, ' + added + ' job(s) queued'
});
return [logs];
