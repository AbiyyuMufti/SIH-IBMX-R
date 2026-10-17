// Builds flows/vfc-pbi-report.json, the VFC tab "PBI report build": it builds
// the pbi_* tables of eu_report/pbi_report/report from the CSV files in the
// data lake (eu_report/reference and eu_report/pbi_report/source).
// Step 1: pbi_machine_names, pbi_shift_naming, pbi_calendar.
// Step 2: pbi_plan_opt and pbi_time_utilisation, one file per site and month.
// Step 3: pbi_daily_losses, one file per site and month.
// Usage: node scripts/build-vfc-pbi-report-flow.js
// Function code: scripts/vfc/b*.js (this flow), r5/r6/p1 (shared with the
// reference flow). Do not edit the JSON. No loops, left to right, one lane
// per row. Needs the Config tab (global settings).
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  code, makeBuilder, fn, linkInStep, end, split, join, delay, readStep,
  rawStep,
  addLogLanes, applyLayout, compactLanes, measureSpacing
} from './lib-flow-builder.js';
import { shiftSchema, calendarSchema } from './lib-pbi-schemas.js';
import {
  reportMachineSchema, reportPlanSchema, reportUtilSchema, reportLossSchema
} from './lib-pbi-report-schemas.js';
import { S } from './lib-flow-builder.js';

const TABLES = [
  'pbi_machine_names', 'pbi_shift_naming', 'pbi_calendar',
  'pbi_plan_opt', 'pbi_time_utilisation', 'pbi_daily_losses'
];
const FILE = 'vfc-pbi-report.json';

// Parquet, path and write object: the end of a table lane.
const tableEnd = (table, schema) => [
  { t: 'parquet', key: `${table}_pq`, table, schema },
  fn(`${table}_path`, `Set ${table} path`, 'r6-set-path.js', ['next'],
    { __TABLE__: table }),
  { t: 'write', key: `${table}_write`, table }
];

// Parquet, month path (site and month of the message) and write object.
const monthEnd = (table, schema) => [
  { t: 'parquet', key: `${table}_pq`, table, schema },
  fn(`${table}_path`, `Set ${table} month path`, 'b6-month-path.js', ['next']),
  { t: 'write', key: `${table}_write`, table }
];

// Collect, decide, then the table end.
const refEnd = (table, schema, extra = []) => [
  fn(`${table}_collect`, `Collect ${table}`, 'r5-collect.js', ['next']),
  ...extra,
  fn(`${table}_decide`, `Decide ${table}`, 'r5-decide.js', ['next', 'LOG'],
    { __TABLE__: table }),
  ...tableEnd(table, schema)
];

// The VFC nodes without a helper in lib-flow-builder.js.
const listNode = (key) => rawStep(key, {
  type: 'list objects', name: 'List objects', subtenant: '', path: ''
});
// Same settings as the csv node the user tested: header row, one message
// with the array of all rows (multi: mult).
const csvNode = (key) => rawStep(key, {
  type: 'csv', name: 'Parse CSV', sep: ',', hdrin: true, hdrout: '',
  multi: 'mult', ret: '\\n', temp: 'parser csv'
});

function buildFlow() {
  const b = makeBuilder(330);
  const { add, id, col, rowY, comment, lane, linkOut } = b;
  let r = 1;

  const stage1 = b.nextStage();
  comment(
    `[${stage1}] TRIGGER & TASK SETTINGS`,
    `STAGE ${stage1} - TRIGGER AND TASK SETTINGS. Builds the Power BI tables of eu_report/pbi_report/report from the CSV files in the data lake. Tables: pbi_machine_names (Machine Names files, filters of the report queries), pbi_shift_naming (the distinct shifts), pbi_calendar (generated), pbi_plan_opt and pbi_time_utilisation (the month files of the sites, with Glidepaths targets and shift names). The inject payload is the job: {"tables": [...], "sites": [...], "from": "YYYY-MM", "to": "YYYY-MM"}; a missing list means all, missing months mean last month and this month. Nothing is written while the table is true in DRY_RUN of 1.1.`,
    r
  );
  add({
    id: b.newId(), type: 'inject', name: 'Run (edit payload)', topic: '',
    payload: '{"tables":["pbi_plan_opt","pbi_time_utilisation"],' +
      '"sites":["Hull"],"from":"2026-09","to":"2026-10"}',
    payloadType: 'json', repeat: '', repeatEnd: '0', endTime: '0',
    crontab: '', offset: 'NaN', once: false, properties: '',
    timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false,
    powerMode: false, x: col(0), y: rowY(r), wires: [[id('settings')]]
  });
  // The jobs of the lake watcher (tab PBI report listener) enter node 1.1:
  // a clock takes one queued job from global context every 10 s.
  add({
    id: b.newId(), type: 'inject', name: 'Job queue check every 10 s',
    topic: '', payload: '', payloadType: 'date', repeat: '10',
    repeatEnd: '0', endTime: '0', crontab: '', offset: 'NaN', once: false,
    properties: '', timezone: 'UTC', betweentimesunit: 'm',
    showNextExecution: false, powerMode: false, x: col(0), y: rowY(r) + 80,
    wires: [[id('jobTake')]]
  });
  add({
    id: id('jobTake'), type: 'function', name: '1.0 Take queued job',
    func: code('w6-take-job.js'), outputs: 1, language: 'javascript',
    noerr: 0, x: col(1), y: rowY(r) + 80, wires: [[id('settings')]]
  });
  const dryRun = TABLES.map((t, i) =>
    `  ${t}: true${i < TABLES.length - 1 ? ',' : ''}`).join('\n');
  add({
    id: id('settings'), type: 'function', name: '1.1 TASK SETTINGS (edit here)',
    func: code('b1-settings.js').replace('__DRY_RUN__', dryRun),
    outputs: 1, language: 'javascript', noerr: 0, x: col(1), y: rowY(r),
    wires: [[id('startFn')]]
  });
  add({
    id: id('startFn'), type: 'function', name: '1.2 Start jobs',
    func: code('b2-start-jobs.js'), outputs: 4, language: 'javascript',
    noerr: 0, x: col(2), y: rowY(r),
    wires: [
      [linkOut('MACHINES', col(3), rowY(r) - 60)],
      [linkOut('SHIFTS', col(3), rowY(r) - 20)],
      [linkOut('CALENDAR', col(3), rowY(r) + 20)],
      [linkOut('SITE', col(3), rowY(r) + 60)]
    ]
  });
  r++;

  lane(r++, 'MACHINE NAMES: FILES',
    'one message per site: the folder eu_report/reference/machine_names/site=<Site>/ is listed, the newest .csv file is read and parsed (header row, one message with all rows), and the rows of the site are built with the filters of the report queries (Hull: no "GT4 - Auto", Dept Dries Pack or Liquids Pack; Nottingham: Area SD Packing or Strepsils Packing; Weinheim: all). A site without a file gives a failed item: then nothing is written for the table.',
    [
      linkInStep('MACHINES'),
      split('mnSplit'),
      fn('mnFolder', 'Set site folder', 'b3-site-folder.js', ['next']),
      listNode('mnList'),
      fn('mnPick', 'Pick the file', 'b3-pick-file.js', ['next', 'MN ITEM']),
      readStep('mnRead', 'Read Machine Names file'),
      csvNode('mnCsv'),
      fn('mnRows', 'Build machine rows', 'b4-machine-rows.js', ['next']),
      end('MN ITEM')
    ]);
  lane(r++, 'pbi_machine_names',
    'the join waits for the items of all sites, collect puts the rows in one list, decide writes nothing when a site failed or in dry-run mode, then parquet, path and write object. Unique Machine Name = machine name + "-" + site, as in the report. One file for all sites.',
    [
      linkInStep('MN ITEM'),
      join('mnJoin', 'Wait for all sites'),
      ...refEnd('pbi_machine_names', reportMachineSchema)
    ]);
  lane(r++, 'SHIFT NAMES: FILE',
    'the folder eu_report/reference/shift_naming/site=All/ is listed, the newest .csv file (Shift Patterns Provideam EU, columns ShiftName and Shift) is read and parsed, one row per line.',
    [
      linkInStep('SHIFTS'),
      fn('snFolder', 'Set shift folder', 'b3-shift-folder.js', ['next']),
      listNode('snList'),
      fn('snPick', 'Pick the file', 'b3-pick-file.js', ['next', 'SN ITEM']),
      readStep('snRead', 'Read Shift Patterns file'),
      csvNode('snCsv'),
      fn('snRows', 'Build shift rows', 'b4-shift-rows.js', ['next']),
      end('SN ITEM')
    ]);
  lane(r++, 'pbi_shift_naming',
    'collect, keep every shift once (the report takes the distinct Shift values: Afternoon, Blue, Day, Gold, Green, Night, Red), decide, parquet, path, write object.',
    [
      linkInStep('SN ITEM'),
      ...refEnd('pbi_shift_naming', shiftSchema, [
        fn('snDistinct', 'Keep distinct shifts', 'm5-distinct.js', ['next'])
      ])
    ]);
  lane(r++, 'pbi_calendar',
    'generated, no file: one row per date from CALENDAR_START to CALENDAR_END in 1.1 (2011-01-01 to 2050-12-31 as in the report, 14610 rows), Monday week start, week number as DAX WEEKNUM(date, 2). Dates are text YYYY-MM-DD.',
    [
      linkInStep('CALENDAR'),
      fn('calFn', 'Build calendar rows', 'p1-build-calendar.js',
        ['next', 'LOG']),
      ...tableEnd('pbi_calendar', calendarSchema)
    ]);
  lane(r++, 'SITE SETUP: GLIDEPATHS',
    'one message per site (plan OPT, time utilisation and daily losses share this setup): the folder eu_report/reference/glidepaths/site=<Site>/ is listed, the newest .csv is read and parsed, and the target lookup of the site is stored in flow context: machine-site and month (01/MM/YYYY) give the OEE target (bucket "% OEE"), the PDT target ("Planned Downtime (Total)") and the UPDT target ("Unplanned Downtime (Total)"), as the three target queries of the report do after the unpivot. A site without a file stops here and the log says so.',
    [
      linkInStep('SITE'),
      split('plSplit'),
      fn('plGlideFolder', 'Set glidepaths folder', 'b5-glide-folder.js',
        ['next']),
      listNode('plGlideList'),
      fn('plGlidePick', 'Pick the file', 'b3-pick-file.js',
        ['next', 'PLAN FAILED']),
      readStep('plGlideRead', 'Read Glidepaths file'),
      csvNode('plGlideCsv'),
      fn('plTargets', 'Build target lookup', 'b5-target-lookup.js',
        ['next', 'PLAN FAILED']),
      end('PLAN SHIFTS')
    ]);
  lane(r++, 'SITE SETUP: SHIFT PATTERNS',
    'the Shift Patterns file (eu_report/reference/shift_naming/site=All/) is listed, read and parsed, and the lookup raw shift name to Shift is stored in flow context (the report joins ShiftName to the Shift Type column and keeps the Shift; an unknown name gives an empty shift). Then the site goes to the plan OPT months and/or the daily losses, as the job asks.',
    [
      linkInStep('PLAN SHIFTS'),
      fn('plShiftFolder', 'Set shift folder', 'b5-plan-shift-folder.js',
        ['next']),
      listNode('plShiftList'),
      fn('plShiftPick', 'Pick the file', 'b3-pick-file.js',
        ['next', 'PLAN FAILED']),
      readStep('plShiftRead', 'Read Shift Patterns file'),
      csvNode('plShiftCsv'),
      fn('plShiftLookup', 'Build shift lookup', 'b5-shift-lookup.js',
        ['next', 'PLAN FAILED']),
      fn('siteRoute', 'Route the site', 'b7-route-site.js',
        ['PLAN MONTHS', 'LOSS EQUIP'], {}, true)
    ]);
  lane(r++, 'PLAN OPT: MONTHS',
    'the month files of the site (eu_report/pbi_report/source/plan_opt/site=<Site>/plan_opt_YYYY-MM.csv) are listed and the months of the job that exist are chosen (a missing month is logged and skipped: a read node would stop on a missing file). One message per month, one per second.',
    [
      linkInStep('PLAN MONTHS'),
      fn('plFolder', 'Set plan OPT folder', 'b5-plan-folder.js', ['next']),
      listNode('plList'),
      fn('plChoose', 'Choose months', 'b5-choose-months.js',
        ['next', 'LOG']),
      split('plMonthSplit'),
      delay('plMonthDelay', 'One month per second'),
      end('PLAN FILE')
    ]);
  lane(r++, 'PLAN OPT: ROWS',
    'one month of one site: the file is read and parsed, then pbi_plan_opt rows (machine and area rules of the site, shift name from the Shift Patterns file, minutes without seconds, Unique Machine Name, Product Key, the three targets of the month) and pbi_time_utilisation rows (own machine rules, sum per machine and day, minutes with seconds) are built. Out 3 is a check line: rows read, kept, left out, shifts without a mapping, machines without a target.',
    [
      linkInStep('PLAN FILE'),
      fn('plMonthFile', 'Set month file', 'b5-month-file.js', ['next']),
      readStep('plRead', 'Read plan OPT month file'),
      csvNode('plCsv'),
      fn('plRows', 'Build plan rows', 'b6-plan-rows.js',
        ['PLAN TABLE', 'UTIL TABLE', 'LOG'], {}, true)
    ]);
  lane(r++, 'pbi_plan_opt',
    'decide (nothing is written in dry-run mode or for an empty month), then parquet, the month path eu_report/pbi_report/report/pbi_plan_opt/site=<Site>/pbi_plan_opt_<YYYY-MM>.parquet and write object. A rerun replaces the month.',
    [
      linkInStep('PLAN TABLE'),
      fn('pbi_plan_opt_decide', 'Decide pbi_plan_opt', 'r5-decide.js',
        ['next', 'LOG'], { __TABLE__: 'pbi_plan_opt' }),
      ...monthEnd('pbi_plan_opt', reportPlanSchema)
    ]);
  lane(r++, 'pbi_time_utilisation',
    'the same for pbi_time_utilisation: one row per machine and day, total, planned and OEE time summed in minutes, All Time 1440.',
    [
      linkInStep('UTIL TABLE'),
      fn('pbi_time_utilisation_decide', 'Decide pbi_time_utilisation',
        'r5-decide.js', ['next', 'LOG'],
        { __TABLE__: 'pbi_time_utilisation' }),
      ...monthEnd('pbi_time_utilisation', reportUtilSchema)
    ]);
  lane(r++, 'LOSSES: EQUIPMENT',
    'daily losses only: the Equipment Coding file of the site (eu_report/reference/equipment_coding/site=<Site>/) is read and the lookup "machine + loss description" to equipment is stored in flow context (an empty equipment is "Unclassed", as in the report queries). Weinheim has no Merged Unique Identifier column: the key is built from machine and description.',
    [
      linkInStep('LOSS EQUIP'),
      fn('lsEquipFolder', 'Set equipment folder', 'b7-set-folder.js',
        ['next'], { __TYPE__: 'equipment_coding', __ROOT__: 'referenceFolder' }),
      listNode('lsEquipList'),
      fn('lsEquipPick', 'Pick the file', 'b3-pick-file.js',
        ['next', 'PLAN FAILED']),
      readStep('lsEquipRead', 'Read Equipment Coding file'),
      csvNode('lsEquipCsv'),
      fn('lsEquipLookup', 'Build equipment lookup', 'b7-equip-lookup.js',
        ['next', 'PLAN FAILED']),
      end('LOSS HAVE')
    ]);
  lane(r++, 'LOSSES: MONTHS',
    'the month files of three types are listed for the site (volume loss correction, plan OPT, line losses) and the months that exist are stored (an optional type with a missing month is skipped, a read node would stop on it). The months of the job that have a line loss file are chosen: one message per month, one per second.',
    [
      linkInStep('LOSS HAVE'),
      fn('lsVcFolder', 'Set correction folder', 'b7-set-folder.js', ['next'],
        { __TYPE__: 'volume_loss_correction', __ROOT__: 'sourceFolder' }),
      listNode('lsVcList'),
      fn('lsVcStore', 'Store correction months', 'b7-store-months.js',
        ['next']),
      fn('lsPlanFolder', 'Set plan OPT folder', 'b5-plan-folder.js', ['next']),
      listNode('lsPlanList'),
      fn('lsPlanStore', 'Store plan OPT months', 'b7-store-months.js',
        ['next']),
      fn('lsLossFolder', 'Set line loss folder', 'b7-set-folder.js', ['next'],
        { __TYPE__: 'line_losses', __ROOT__: 'sourceFolder' }),
      listNode('lsLossList'),
      fn('lsChoose', 'Choose months', 'b5-choose-months.js',
        ['next', 'LOG']),
      split('lsMonthSplit'),
      delay('lsMonthDelay', 'One month per 5 s', 5),
      end('LOSS VC')
    ]);
  lane(r++, 'LOSSES: CORRECTION',
    'one month of one site: the volume loss correction file of the month (loss units and time per date, machine, group, subgroup and description, text replacements of the site as in the report) is read and a lookup is stored in flow context. A month without a file goes on with an empty lookup (no loss units).',
    [
      linkInStep('LOSS VC'),
      fn('lsMonth', 'Set month', 'b5-month-file.js', ['next']),
      fn('lsVcFile', 'Set correction file', 'b7-month-file.js',
        ['next', 'LOSS CAP'],
        { __TYPE__: 'volume_loss_correction', __KEY__: 'vc', __OPTIONAL__: 'true' }),
      readStep('lsVcRead', 'Read correction file'),
      csvNode('lsVcCsv'),
      fn('lsVcLookup', 'Build correction lookup', 'b7-vol-lookup.js',
        ['next']),
      end('LOSS CAP')
    ]);
  lane(r++, 'LOSSES: VOLUME TOTALS',
    'the plan OPT file of the month gives the volume total per machine and day (the sum of Capacity, the Targets Volume query of the report). A month without a plan file goes on with an empty lookup.',
    [
      linkInStep('LOSS CAP'),
      fn('lsPlanFile', 'Set plan OPT file', 'b7-month-file.js',
        ['next', 'LOSS FILE'],
        { __TYPE__: 'plan_opt', __KEY__: 'cap', __OPTIONAL__: 'true' }),
      readStep('lsPlanRead', 'Read plan OPT file'),
      csvNode('lsPlanCsv'),
      fn('lsPlanLookup', 'Build volume totals', 'b7-cap-lookup.js', ['next']),
      end('LOSS FILE')
    ]);
  lane(r++, 'LOSSES: ROWS',
    'the line loss file of the month is read and the rows are built with the steps of the report queries of the site (duplicate stops, group and machine filters, shift name, volume key and loss units from the correction, equipment, text replacements of the subgroup, loss target key and value from Glidepaths, volume total). Out 2 is a check line: rows read, kept, filtered, without loss units, equipment or target.',
    [
      linkInStep('LOSS FILE'),
      fn('lsLossFile', 'Set line loss file', 'b7-loss-file.js', ['next']),
      readStep('lsLossRead', 'Read line loss file'),
      csvNode('lsLossCsv'),
      fn('lsRows', 'Build loss rows', 'b7-loss-rows.js',
        ['LOSS TABLE', 'LOG'], {}, true)
    ]);
  lane(r++, 'pbi_daily_losses',
    'decide (nothing is written in dry-run mode or for an empty month), then parquet, the month path eu_report/pbi_report/report/pbi_daily_losses/site=<Site>/pbi_daily_losses_<YYYY-MM>.parquet and write object. A rerun replaces the month.',
    [
      linkInStep('LOSS TABLE'),
      fn('pbi_daily_losses_decide', 'Decide pbi_daily_losses', 'r5-decide.js',
        ['next', 'LOG'], { __TABLE__: 'pbi_daily_losses' }),
      ...monthEnd('pbi_daily_losses', reportLossSchema)
    ]);
  lane(r++, 'SITE SETUP: FAILED',
    'a Glidepaths, Shift Patterns or Equipment Coding file that is missing or empty: one log line, nothing is built for that site.',
    [
      linkInStep('PLAN FAILED'),
      fn('plFailed', 'Describe failure', 'b5-pick-failed.js', ['LOG'])
    ]);
  addLogLanes(b, r, 'pbi-report', true);

  // The calendar node reads the dry-run switch of its own table.
  const calendar = b.nodes.find((n) => n.id === id('calFn'));
  calendar.func = calendar.func.replace(
    'if (cfg.dryRun) {', 'if (cfg.dryRun.pbi_calendar) {');

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'PBI report build',
    disabled: false, allowCycles: false,
    info: 'Builds the pbi_* tables of eu_report/pbi_report/report from the CSV files in the data lake (machine names, shift names, calendar, plan OPT, time utilisation). No API calls. Needs the Config tab.'
  });
  return b.nodes;
}

mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
const nodes = buildFlow();
compactLanes(nodes);
const layoutUrl = new URL(`../flows/layouts/${FILE}`, import.meta.url);
if (existsSync(layoutUrl)) {
  applyLayout(nodes, JSON.parse(readFileSync(layoutUrl, 'utf8')));
}
const { errors, warnings, stats } = validateFlow(nodes);
if (errors.length) {
  throw new Error(`flow check failed for ${FILE}:\n  ${errors.join('\n  ')}`);
}
writeFileSync(new URL(`../flows/${FILE}`, import.meta.url),
  JSON.stringify(nodes, null, 2) + '\n');
console.log(
  `written flows/${FILE}: ${stats.nodes} nodes, ${stats.linkIn} link in / ` +
    `${stats.linkOut} link out, longest line ${stats.longestLine}`
);
warnings.forEach((w) => console.log(`warn: ${w}`));
const spacing = measureSpacing(nodes, 0);
console.log(`  spacing: ${spacing.overlaps} node pairs overlap by the estimate`);
