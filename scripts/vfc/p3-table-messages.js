// Builds one message per table for the parquet nodes.
// In: msg.planRows, utilRows, lossRows and msg.tables. Out 1 to 5: the
// five day tables. Out 6: log line. Dry run writes nothing, only the log.
var day = msg.day;
var cfg = flow.get('cfg');

// Machine names: the assets of this site, from dim_asset.
var machines = msg.tables.dim_asset.filter(function (a) {
  return a.site === cfg.site;
}).map(function (a) {
  return {
    site_name: a.site,
    area: a.area,
    dept: a.area,
    machine_name: a.asset_name,
    product_type: null,
    unique_machine_name: a.asset_id,
    loaded_at: Date.now()
  };
});

// Shift names: the distinct shift names of the calendars of this site.
var calendars = {};
msg.tables.dim_asset.forEach(function (a) {
  if (a.site === cfg.site) {
    calendars[a.calendar_id] = true;
  }
});
var seen = {};
var shifts = [];
msg.tables.dim_shift.forEach(function (s) {
  if (calendars[s.calendar_id] && !seen[s.shift_name]) {
    seen[s.shift_name] = true;
    shifts.push({ shift: s.shift_name, loaded_at: Date.now() });
  }
});

var counts = 'plan ' + msg.planRows.length +
  ', util ' + msg.utilRows.length +
  ', losses ' + msg.lossRows.length +
  ', machines ' + machines.length +
  ', shifts ' + shifts.length;
if (cfg.dryRun) {
  var dry = {
    topic: 'log',
    payload: day + ' [pbi] DRY RUN: ' + counts
  };
  return [null, null, null, null, null, dry];
}

function table(name, rows) {
  if (!rows.length) {
    return null;
  }
  return { topic: name, day: day, payload: rows };
}
var line = {
  topic: 'log',
  payload: day + ' [pbi] WRITING ' + counts
};
return [
  table('pbi_plan_opt', msg.planRows),
  table('pbi_time_utilisation', msg.utilRows),
  table('pbi_daily_losses', msg.lossRows),
  table('pbi_machine_names', machines),
  table('pbi_shift_naming', shifts),
  line
];
