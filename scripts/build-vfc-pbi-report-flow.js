// Builds flows/vfc-pbi-report.json, the VFC tab "PBI report build": it builds
// the pbi_* tables of eu_report/pbi_report/report from the CSV files in the
// data lake (eu_report/reference and eu_report/pbi_report/source).
// Step 1 (this file): pbi_machine_names, pbi_shift_naming, pbi_calendar.
// Usage: node scripts/build-vfc-pbi-report-flow.js
// Function code: scripts/vfc/b*.js (this flow), r5/r6/p1 (shared with the
// reference flow). Do not edit the JSON. No loops, left to right, one lane
// per row. Needs the Config tab (global settings).
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  code, makeBuilder, fn, linkInStep, end, split, join, readStep, rawStep,
  addLogLanes, applyLayout, compactLanes, measureSpacing
} from './lib-flow-builder.js';
import {
  machineSchema, shiftSchema, calendarSchema
} from './lib-pbi-schemas.js';

const TABLES = ['pbi_machine_names', 'pbi_shift_naming', 'pbi_calendar'];
const FILE = 'vfc-pbi-report.json';

// Parquet, path and write object: the end of a table lane.
const tableEnd = (table, schema) => [
  { t: 'parquet', key: `${table}_pq`, table, schema },
  fn(`${table}_path`, `Set ${table} path`, 'r6-set-path.js', ['next'],
    { __TABLE__: table }),
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
    `STAGE ${stage1} - TRIGGER AND TASK SETTINGS. Builds the Power BI tables of eu_report/pbi_report/report from the CSV files in the data lake. This step: pbi_machine_names (Machine Names files of the sites, with the filters of the report queries), pbi_shift_naming (the distinct shifts of the Shift Patterns file), pbi_calendar (generated). The inject payload is the job: {"tables": [...], "sites": [...]}; a missing list means all tables, all sites. Nothing is written while the table is true in DRY_RUN of 1.1.`,
    r
  );
  add({
    id: b.newId(), type: 'inject', name: 'Run (edit payload)', topic: '',
    payload: '{"tables":["pbi_machine_names","pbi_shift_naming",' +
      '"pbi_calendar"],"sites":["Hull","Nottingham","Weinheim"]}',
    payloadType: 'json', repeat: '', repeatEnd: '0', endTime: '0',
    crontab: '', offset: 'NaN', once: false, properties: '',
    timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false,
    powerMode: false, x: col(0), y: rowY(r), wires: [[id('settings')]]
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
    func: code('b2-start-jobs.js'), outputs: 3, language: 'javascript',
    noerr: 0, x: col(2), y: rowY(r),
    wires: [
      [linkOut('MACHINES', col(3), rowY(r) - 40)],
      [linkOut('SHIFTS', col(3), rowY(r))],
      [linkOut('CALENDAR', col(3), rowY(r) + 40)]
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
      ...refEnd('pbi_machine_names', machineSchema)
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
    'generated, no file: one row per date from CALENDAR_START to CALENDAR_END in 1.1 (2011-01-01 to 2050-12-31 as in the report, 14610 rows), Monday week start, ISO week number. Dates are text YYYY-MM-DD.',
    [
      linkInStep('CALENDAR'),
      fn('calFn', 'Build calendar rows', 'p1-build-calendar.js',
        ['next', 'LOG']),
      ...tableEnd('pbi_calendar', calendarSchema)
    ]);
  addLogLanes(b, r, 'pbi-report');

  // The calendar node reads the dry-run switch of its own table.
  const calendar = b.nodes.find((n) => n.id === id('calFn'));
  calendar.func = calendar.func.replace(
    'if (cfg.dryRun) {', 'if (cfg.dryRun.pbi_calendar) {');

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'PBI report build',
    disabled: false, allowCycles: false,
    info: 'Builds the pbi_* tables of eu_report/pbi_report/report from the CSV files in the data lake (step 1: machine names, shift names, calendar). No API calls. Needs the Config tab.'
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
