// Builds flows/vfc-pbi-report-2.json, the VFC tab "PBI report build 2": the
// tables of the site dashboards that the first tab has no room for (a tab
// holds 200 nodes at most): Run_Rates_EU and Volume_CoV_EU (one file per
// site and month) and Format_List_EU (one file per site), from the files in
// the data lake, to <root>/report (docs/pbi-report-build-2.md).
// Usage: node scripts/build-vfc-pbi-report-2-flow.js
// Function code: scripts/vfc/b9-*.js, plus the b*/r5 nodes shared with the
// first tab (lanes in lib-pbi-report-lanes.js). Do not edit the JSON.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  code, makeBuilder, fn, linkInStep, end, split, delay, readStep,
  listNode, csvNode, addLogLanes, applyLayout, compactLanes, measureSpacing
} from './lib-flow-builder.js';
import {
  reportRunRateSchema, reportCovSchema, reportFormatSchema
} from './lib-pbi-report-schemas.js';
import {
  monthEnd, siteSetupLanes, setupFailedLane
} from './lib-pbi-report-lanes.js';

const FLOW_ID = 'pbi-report-2';
const QUEUE = 'jobQueue_2';
const TABLES = ['Run_Rates_EU', 'Volume_CoV_EU', 'Format_List_EU'];
const FILE = 'vfc-pbi-report-2.json';

// The months of one file type of the site: list the folder, keep the months
// of the job that have a file, one message per month, one per second.
const monthSteps = (prefix, type, out) => [
  fn(`${prefix}Folder`, `Set ${type} folder`, 'b7-set-folder.js', ['next'],
    { __TYPE__: type, __ROOT__: 'sourceFolder' }),
  listNode(`${prefix}List`),
  fn(`${prefix}Choose`, 'Choose months', 'b5-choose-months.js',
    ['next', 'LOG']),
  split(`${prefix}MonthSplit`),
  delay(`${prefix}MonthDelay`, 'One month per second'),
  end(out)
];

// One month file: set the path, read, parse, build the rows of the table.
const rowSteps = (prefix, what, builder, file, out) => [
  fn(`${prefix}MonthFile`, 'Set month file', 'b5-month-file.js', ['next']),
  readStep(`${prefix}Read`, `Read ${what} month file`),
  csvNode(`${prefix}Csv`),
  fn(`${prefix}Rows`, builder, file, [out, 'LOG'], {}, true)
];

function buildFlow() {
  const b = makeBuilder(340);
  const { add, id, stableId, col, rowY, comment, lane, linkOut } = b;
  let r = 1;

  const stage1 = b.nextStage();
  comment(
    `[${stage1}] TRIGGER & TASK SETTINGS`,
    `STAGE ${stage1} - TRIGGER AND TASK SETTINGS. Builds Run_Rates_EU (Provideam run rates, one row per machine and hour), Volume_CoV_EU (plan OPT rows per day, shift and machine) and Format_List_EU (the Format List file of each site) for the site dashboards. Every row gets Dept, Area, Product Type from the Machine Names file and In EU Report from the report scope file (not Format_List_EU). The inject payload is the job: {"tables": [...], "sites": [...], "from": "YYYY-MM", "to": "YYYY-MM"}; a missing list means all, missing months mean last month and this month. The lake watcher queues its jobs in global context ${QUEUE}. Nothing is written while the table is true in DRY_RUN of 1.1.`,
    r
  );
  add({
    id: b.newId(), type: 'inject', name: 'Run (edit payload)', topic: '',
    payload: '{"tables":["Run_Rates_EU","Volume_CoV_EU","Format_List_EU"],' +
      '"sites":["Hull"],"from":"2026-09","to":"2026-10"}',
    payloadType: 'json', repeat: '', repeatEnd: '0', endTime: '0',
    crontab: '', offset: 'NaN', once: false, properties: '',
    timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false,
    powerMode: false, x: col(0), y: rowY(r), wires: [[id('settings')]]
  });
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
    func: code('w6-take-job.js').replace('__QUEUE__', QUEUE),
    outputs: 1, language: 'javascript', noerr: 0,
    x: col(1), y: rowY(r) + 80, wires: [[id('settings')]]
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
    id: stableId('pbiReport2BackfillIn'),
    type: 'link in',
    name: `${FLOW_ID} BACKFILL`,
    links: [],
    x: col(0),
    y: rowY(r) + 40,
    wires: [[id('settings')]]
  });
  add({
    id: id('startFn'), type: 'function', name: '1.2 Start jobs',
    func: code('b2-start-jobs.js').replace('__FLOW__', FLOW_ID),
    outputs: 1, language: 'javascript', noerr: 0, x: col(2), y: rowY(r),
    wires: [[linkOut('SITE', col(3), rowY(r))]]
  });
  r++;

  r = siteSetupLanes(b, r, 'SITE', true,
    fn('siteRoute', 'Route the site', 'b9-route-tables.js',
      ['RUN RATE MONTHS', 'COV MONTHS', 'FORMAT LIST'], {}, true));

  lane(r++, 'RUN RATES: MONTHS',
    'the run rates month files of the site (<root>/pbi_report/source/run_rates/site=<Site>/run_rates_YYYY-MM.csv, made by the normalizer from the Provideam Run Rates exports) are listed and the months of the job that exist are chosen (a missing month is logged and skipped). One message per month, one per second.',
    [linkInStep('RUN RATE MONTHS'),
      ...monthSteps('rr', 'run_rates', 'RUN RATE FILE')]);
  lane(r++, 'RUN RATES: ROWS',
    'one month of one site: the file is read and parsed and the Run_Rates_EU rows are built as the report queries Run Rates H, N, W do: rows without a machine and rows with Good Parts 0 out, shift name from the Shift Patterns file, Weinheim part code cut, Unique Machine Name, Product Key. Out 2 is a check line.',
    [linkInStep('RUN RATE FILE'),
      ...rowSteps('rr', 'run rates', 'Build run rate rows',
        'b9-run-rate-rows.js', 'RUN RATE TABLE')]);
  lane(r++, 'Run_Rates_EU',
    'Dept, Area, Product Type, Data Source and In EU Report are added, the rows are split by the source of their line in 1.1 CONFIG, then decide, parquet, the month path <folder>/Run_Rates_EU/site=<Site>/Run_Rates_EU_<YYYY-MM>_provideam.parquet and write object.',
    [linkInStep('RUN RATE TABLE'), ...monthEnd('Run_Rates_EU', reportRunRateSchema)]);

  lane(r++, 'VOLUME COV: MONTHS',
    'the plan OPT month files of the site are listed and the months of the job that exist are chosen. One message per month, one per second.',
    [linkInStep('COV MONTHS'), ...monthSteps('cv', 'plan_opt', 'COV FILE')]);
  lane(r++, 'VOLUME COV: ROWS',
    'one month of one site: the plan OPT file is read and grouped per day, shift and machine as the report queries Volume CoV H, N, W do: Good Parts Sum, Cap Max (largest Capacity), only groups over 1,000 good parts. Hull groups on the mapped shift, the other sites on the raw shift name. Out 2 is a check line.',
    [linkInStep('COV FILE'),
      ...rowSteps('cv', 'plan OPT', 'Build volume CoV rows',
        'b9-cov-rows.js', 'COV TABLE')]);
  lane(r++, 'Volume_CoV_EU',
    'the same for Volume_CoV_EU: machine and scope columns, split by source, decide, parquet, month path, write object.',
    [linkInStep('COV TABLE'), ...monthEnd('Volume_CoV_EU', reportCovSchema)]);

  lane(r++, 'FORMAT LIST',
    'the Format List file of the site (<root>/reference/format_list/site=<Site>/, newest .csv: Site Name, MachineName, Product Name, Brand, Unit Size, Unit Count/Format, Extra Info) is read and Unique Machine Name and Product Key (the key of plan OPT, losses and run rates) are added. A site without a file (Nottingham today) is logged and skipped.',
    [
      linkInStep('FORMAT LIST'),
      fn('flFolder', 'Set format list folder', 'b7-set-folder.js', ['next'],
        { __TYPE__: 'format_list', __ROOT__: 'referenceFolder' }),
      listNode('flList'),
      fn('flPick', 'Pick the file', 'b3-pick-file.js',
        ['next', 'PLAN FAILED']),
      readStep('flRead', 'Read Format List file'),
      csvNode('flCsv'),
      fn('flRows', 'Build format rows', 'b9-format-rows.js',
        ['next', 'LOG'], {}, true),
      fn('flDecide', 'Decide Format_List_EU', 'r5-decide.js', ['next', 'LOG'],
        { __TABLE__: 'Format_List_EU' }),
      {
        t: 'parquet', key: 'flPq', table: 'Format_List_EU',
        schema: reportFormatSchema
      },
      fn('flPath', 'Set Format_List_EU site path', 'b9-site-path.js',
        ['next']),
      { t: 'write', key: 'flWrite', table: 'Format_List_EU' }
    ]);
  r = setupFailedLane(b, r,
    'Machine Names, Shift Patterns, report scope or Format List');
  addLogLanes(b, r, FLOW_ID, true);

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'PBI report build 2',
    disabled: false, allowCycles: false,
    info: 'Builds Run_Rates_EU, Volume_CoV_EU and Format_List_EU (site dashboards) from the files in the data lake. No API calls. Needs the Config tab.'
  });
  return b.nodes;
}

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
