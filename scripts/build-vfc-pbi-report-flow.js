// Builds flows/vfc-pbi-report.json, the VFC tab "PBI report build": it builds
// the three Tableau tables Plan_OPT_EU, Time_Utilisation_EU and
// Daily_Losses_EU from the Provideam CSV files in the data lake
// (<root>/reference and <root>/pbi_report/source), one file per site and
// month, to <root>/report or, for a line on another source,
// <root>/candidate/provideam (docs/report-config.md).
// Usage: node scripts/build-vfc-pbi-report-flow.js
// Function code: scripts/vfc/b*.js (this flow), r5/r6/p1 (shared with the
// reference flow). Do not edit the JSON. No loops, left to right, one lane
// per row. Needs the Config tab (global settings).
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  code, makeBuilder, fn, linkInStep, end, split, delay, readStep,
  listNode, csvNode,
  addLogLanes, applyLayout, compactLanes, measureSpacing
} from './lib-flow-builder.js';
import {
  reportPlanSchema, reportUtilSchema, reportLossSchema
} from './lib-pbi-report-schemas.js';

const TABLES = ['Plan_OPT_EU', 'Time_Utilisation_EU', 'Daily_Losses_EU'];
const FILE = 'vfc-pbi-report.json';

// The end of a table lane: machine columns, split by source, decide (one
// message per folder), parquet, month path and write object.
const monthEnd = (table, schema) => [
  fn(`${table}_cols`, 'Add machine columns', 'b8-machine-columns.js',
    ['next']),
  fn(`${table}_split`, 'Split by source', 'b8-split-source.js', ['next']),
  fn(`${table}_decide`, `Decide ${table}`, 'r5-decide.js', ['next', 'LOG'],
    { __TABLE__: table }),
  { t: 'parquet', key: `${table}_pq`, table, schema },
  fn(`${table}_path`, `Set ${table} month path`, 'b6-month-path.js', ['next']),
  { t: 'write', key: `${table}_write`, table }
];

function buildFlow() {
  const b = makeBuilder(330);
  const { add, id, stableId, col, rowY, comment, lane, linkOut } = b;
  let r = 1;

  const stage1 = b.nextStage();
  comment(
    `[${stage1}] TRIGGER & TASK SETTINGS`,
    `STAGE ${stage1} - TRIGGER AND TASK SETTINGS. Builds the three Tableau tables Plan_OPT_EU, Time_Utilisation_EU and Daily_Losses_EU from the Provideam CSV files in the data lake, one file per site and month, with Dept, Area and Product Type from the Machine Names file of the site and Data Source = Provideam. The rows of a line whose source in 1.1 CONFIG is Provideam go to <root>/report (what Tableau reads), the rows of a line on another source to <root>/candidate/provideam. The inject payload is the job: {"tables": [...], "sites": [...], "from": "YYYY-MM", "to": "YYYY-MM"}; a missing list means all, missing months mean last month and this month. Nothing is written while the table is true in DRY_RUN of 1.1.`,
    r
  );
  add({
    id: b.newId(), type: 'inject', name: 'Run (edit payload)', topic: '',
    payload: '{"tables":["Plan_OPT_EU","Time_Utilisation_EU",' +
      '"Daily_Losses_EU"],"sites":["Hull"],"from":"2026-09","to":"2026-10"}',
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
    id: stableId('pbiReportBackfillIn'),
    type: 'link in',
    name: 'pbi-report BACKFILL',
    links: [],
    x: col(0),
    y: rowY(r) + 40,
    wires: [[id('settings')]]
  });
  add({
    id: id('startFn'), type: 'function', name: '1.2 Start jobs',
    func: code('b2-start-jobs.js'), outputs: 1, language: 'javascript',
    noerr: 0, x: col(2), y: rowY(r),
    wires: [[linkOut('SITE', col(3), rowY(r))]]
  });
  r++;

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
      end('SITE MACHINES')
    ]);
  lane(r++, 'SITE SETUP: MACHINE NAMES',
    'the Machine Names file of the site (<root>/reference/machine_names/site=<Site>/, newest .csv) is listed, read and parsed, and the lookup MachineName to Dept, Area and Product Type is stored in flow context, with the filters of the report queries (Hull: no "GT4 - Auto", Dept Dries Pack or Liquids Pack; Nottingham: Area SD Packing or Strepsils Packing; Weinheim: all). A machine left out has empty Dept, Area and Product Type in the tables, as in the report. A site without a file stops here and the log says so.',
    [
      linkInStep('SITE MACHINES'),
      fn('mnFolder', 'Set machine names folder', 'b3-site-folder.js',
        ['next']),
      listNode('mnList'),
      fn('mnPick', 'Pick the file', 'b3-pick-file.js',
        ['next', 'PLAN FAILED']),
      readStep('mnRead', 'Read Machine Names file'),
      csvNode('mnCsv'),
      fn('mnLookup', 'Build machine lookup', 'b5-machine-lookup.js',
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
    'one month of one site: the file is read and parsed, then Plan_OPT_EU rows (machine and area rules of the site, shift name from the Shift Patterns file, minutes without seconds, Unique Machine Name, Product Key, the three targets of the month) and Time_Utilisation_EU rows (own machine rules, sum per machine and day, minutes with seconds) are built. Out 3 is a check line: rows read, kept, left out, shifts without a mapping, machines without a target.',
    [
      linkInStep('PLAN FILE'),
      fn('plMonthFile', 'Set month file', 'b5-month-file.js', ['next']),
      readStep('plRead', 'Read plan OPT month file'),
      csvNode('plCsv'),
      fn('plRows', 'Build plan rows', 'b6-plan-rows.js',
        ['PLAN TABLE', 'UTIL TABLE', 'LOG'], {}, true)
    ]);
  lane(r++, 'Plan_OPT_EU',
    'Dept, Area, Product Type from the machine lookup of the site and Data Source = Provideam are added, the rows are split by the source of their line in 1.1 CONFIG (a line on Provideam: <root>/report, any other: <root>/candidate/provideam, one message per folder), then decide (nothing is written in dry-run mode or for an empty month), parquet, the month path <folder>/Plan_OPT_EU/site=<Site>/Plan_OPT_EU_<YYYY-MM>_provideam.parquet and write object. A rerun replaces the month.',
    [
      linkInStep('PLAN TABLE'),
      ...monthEnd('Plan_OPT_EU', reportPlanSchema)
    ]);
  lane(r++, 'Time_Utilisation_EU',
    'the same for Time_Utilisation_EU: one row per machine and day, total, planned and OEE time summed in minutes, All Time 1440.',
    [
      linkInStep('UTIL TABLE'),
      ...monthEnd('Time_Utilisation_EU', reportUtilSchema)
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
  lane(r++, 'Daily_Losses_EU',
    'the same for Daily_Losses_EU: machine columns, split by source, decide, parquet, the month path <folder>/Daily_Losses_EU/site=<Site>/Daily_Losses_EU_<YYYY-MM>_provideam.parquet and write object.',
    [
      linkInStep('LOSS TABLE'),
      ...monthEnd('Daily_Losses_EU', reportLossSchema)
    ]);
  lane(r++, 'SITE SETUP: FAILED',
    'a Glidepaths, Machine Names, Shift Patterns or Equipment Coding file that is missing or empty: one log line, nothing is built for that site.',
    [
      linkInStep('PLAN FAILED'),
      fn('plFailed', 'Describe failure', 'b5-pick-failed.js', ['LOG'])
    ]);
  addLogLanes(b, r, 'pbi-report', true);

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'PBI report build',
    disabled: false, allowCycles: false,
    info: 'Builds Plan_OPT_EU, Time_Utilisation_EU and Daily_Losses_EU (the Tableau tables) from the Provideam CSV files in the data lake, to <root>/report or <root>/candidate/provideam by the source of each line in Config. No API calls. Needs the Config tab.'
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
