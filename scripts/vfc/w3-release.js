// Runs on the clock. Takes the entries of flow context "pending" whose wait
// window is over and turns them into jobs {tables, sites, from, to}. A job
// goes to the queue of the tab that builds its tables (QUEUE_OF, global
// context; each tab takes its jobs one by one). Out: one log line per job.
var SOURCE_WAIT_S = 120;
var REFERENCE_WAIT_S = 300;
// Months before the current month that a reference change rebuilds.
var REFERENCE_MONTHS_BACK = 3;
// Tab PBI report build takes jobQueue, tab PBI report build 2 jobQueue_2.
var QUEUE_OF = {
  Plan_OPT_EU: 'jobQueue',
  Time_Utilisation_EU: 'jobQueue',
  Daily_Losses_EU: 'jobQueue',
  Run_Rates_EU: 'jobQueue_2',
  Volume_CoV_EU: 'jobQueue_2',
  Format_List_EU: 'jobQueue_2'
};
var MONTH_TABLES = [
  'Plan_OPT_EU',
  'Time_Utilisation_EU',
  'Daily_Losses_EU',
  'Run_Rates_EU',
  'Volume_CoV_EU'
];
var PLAN_TABLES = [
  'Plan_OPT_EU',
  'Time_Utilisation_EU',
  'Daily_Losses_EU'
];
var TABLES_OF = {
  plan_opt: PLAN_TABLES.concat(['Volume_CoV_EU']),
  line_losses: ['Daily_Losses_EU'],
  volume_loss_correction: ['Daily_Losses_EU'],
  run_rates: ['Run_Rates_EU'],
  machine_names: MONTH_TABLES,
  shift_naming: MONTH_TABLES,
  glidepaths: PLAN_TABLES,
  equipment_coding: ['Daily_Losses_EU'],
  report_scope: MONTH_TABLES,
  format_list: ['Format_List_EU']
};

var pending = flow.get('pending') || {};
var now = Date.now();
var day = new Date(now).toISOString().slice(0, 10);
var queues = {};
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

// One job per queue: the tables of the job are split by the tab that
// builds them.
function addJob(job, why) {
  var byQueue = {};
  job.tables.forEach(function (table) {
    var name = QUEUE_OF[table];
    byQueue[name] = byQueue[name] || [];
    byQueue[name].push(table);
  });
  Object.keys(byQueue).forEach(function (name) {
    var part = Object.assign({}, job, {
      tables: byQueue[name]
    });
    queues[name] = queues[name] || glob.get(name) || [];
    queues[name].push(part);
    lastQueuedJob = part;
    added++;
    logs.push({
      topic: 'log',
      payload: day + ' [listener] JOB ' + why + ' (' + name + '): ' +
        JSON.stringify(part)
    });
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
Object.keys(queues).forEach(function (name) {
  glob.set(name, queues[name]);
});
var waiting = Object.keys(pending).length;
var status = glob.get('runStatus_pbi-listener') || {};
status.flow = 'pbi-listener';
status.state = 'listening';
status.lastBeatAt = new Date(now).toISOString();
status.pendingEntries = waiting;
status.queuedJobs = (glob.get('jobQueue') || []).length +
  (glob.get('jobQueue_2') || []).length;
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
