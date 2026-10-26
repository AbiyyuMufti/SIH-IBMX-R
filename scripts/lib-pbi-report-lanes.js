// Lanes shared by the two Provideam build tabs: PBI report build
// (build-vfc-pbi-report-flow.js) and PBI rates build
// (build-vfc-pbi-rates-flow.js). Flow context is per tab, so each tab runs
// its own site setup with the same nodes.
import {
  fn, linkInStep, end, split, readStep, listNode, csvNode
} from './lib-flow-builder.js';

// The end of a table lane: machine and scope columns, split by source,
// decide (one message per folder), parquet, month path and write object.
export const monthEnd = (table, schema) => [
  fn(`${table}_cols`, 'Add machine and scope columns',
    'b8-machine-columns.js', ['next']),
  fn(`${table}_split`, 'Split by source', 'b8-split-source.js', ['next']),
  fn(`${table}_decide`, `Decide ${table}`, 'r5-decide.js', ['next', 'LOG'],
    { __TABLE__: table }),
  { t: 'parquet', key: `${table}_pq`, table, schema },
  fn(`${table}_path`, `Set ${table} month path`, 'b6-month-path.js', ['next']),
  { t: 'write', key: `${table}_write`, table }
];

// Machine Names, Shift Patterns and report scope of one site, then the
// route step of the tab. inKey: the link the lane starts from; splitSites:
// the message holds the list of sites (the first setup lane of the tab).
export function siteSetupLanes(b, r, inKey, splitSites, routeStep) {
  b.lane(r++, 'SITE SETUP: MACHINE NAMES',
    'the Machine Names file of the site (<root>/reference/machine_names/site=<Site>/, newest .csv) is listed, read and parsed, and the lookup MachineName to Dept, Area and Product Type is stored in flow context, for every machine of the file (the EU scope is the column In EU Report, from the report scope file). A machine missing from the file has empty Dept, Area and Product Type. A site without a file stops here and the log says so.',
    [
      linkInStep(inKey),
      ...(splitSites ? [split('mnSplit')] : []),
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
  b.lane(r++, 'SITE SETUP: SHIFT PATTERNS',
    'the Shift Patterns file (eu_report/reference/shift_naming/site=All/) is listed, read and parsed, and the lookup raw shift name to Shift is stored in flow context (the report joins ShiftName to the Shift Type column and keeps the Shift; an unknown name gives an empty shift).',
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
      end('SITE SCOPE')
    ]);
  b.lane(r++, 'SITE SETUP: REPORT SCOPE',
    'the report scope file (<root>/reference/report_scope/site=All/, newest .csv, one row per rule: Site, Tables, Rule keep or drop, Column, Value) is listed, read and parsed, and the rules of the site are stored in flow context. They set the column In EU Report of every table (false: a row the EU pages leave out, the site pages keep). Then the site goes on to the tables of the job.',
    [
      linkInStep('SITE SCOPE'),
      fn('scFolder', 'Set report scope folder', 'b5-scope-folder.js',
        ['next']),
      listNode('scList'),
      fn('scPick', 'Pick the file', 'b3-pick-file.js',
        ['next', 'PLAN FAILED']),
      readStep('scRead', 'Read report scope file'),
      csvNode('scCsv'),
      fn('scLookup', 'Build scope lookup', 'b5-scope-lookup.js',
        ['next', 'PLAN FAILED']),
      routeStep
    ]);
  return r;
}

// A reference file that is missing or empty: one log line, nothing is built
// for that site.
export function setupFailedLane(b, r, files) {
  b.lane(r++, 'SITE SETUP: FAILED',
    `a ${files} file that is missing or empty: one log line, nothing is built for that site.`,
    [
      linkInStep('PLAN FAILED'),
      fn('plFailed', 'Describe failure', 'b5-pick-failed.js', ['LOG'])
    ]);
  return r;
}
