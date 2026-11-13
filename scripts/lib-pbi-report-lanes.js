// Lanes shared by the two Provideam build tabs: PBI report build
// (build-vfc-pbi-report-flow.js) and PBI rates build
// (build-vfc-pbi-rates-flow.js). Flow context is per tab, so each tab runs
// its own site setup with the same nodes.
import {
  fn, linkInStep, end, split, readStep, listNode, csvNode
} from './lib-flow-builder.js';

// The id of the link in "eu-oee-fact WRITE" of the tab EU OEE Fact write
// (build-vfc-eu-oee-fact.js): fixed, so the link outs of the other tabs
// can point to it (the VFC keeps cross-tab links by id).
export const FACT_LINK_IN_ID = 'f4c7a.e0e0fa';
export const FACT_LINK_NAME = 'eu-oee-fact WRITE';
// The fixed ids of the link outs that feed it, one per tab.
export const FACT_LINK_OUT_IDS = {
  'pbi-report': 'f4c7a.e0e0f1',
  'pbi-report-2': 'f4c7a.e0e0f2',
  'chartres-live': 'f4c7a.e0e0f3'
};

// The end of a table lane: machine and scope columns, split by source,
// decide (one message per folder), parquet, month path and write object.
// fact: the rows of report/ also go to the link "to FACT" (factLane).
export const monthEnd = (table, schema, fact = false) => [
  fn(`${table}_cols`, 'Add machine and scope columns',
    'b8-machine-columns.js', ['next']),
  fn(`${table}_split`, 'Split by source', 'b8-split-source.js',
    fact ? ['next', 'FACT'] : ['next'],
    { __FACT__: fact ? 'true' : 'false' }),
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
      end('SITE FORMATS')
    ]);
  b.lane(r++, 'SITE SETUP: FORMAT LIST',
    'the Format List file of the site (<root>/reference/format_list/site=<Site>/, newest .csv) is listed, read and parsed, and the lookup Product Key to Brand, Unit Size, Unit Count/Format, Extra Info is stored in flow context (formats_<Site>). A site without a file (Nottingham) gets an empty lookup and goes on: its format columns stay empty.',
    [
      linkInStep('SITE FORMATS'),
      fn('fmFolder', 'Set format list folder', 'b5-format-folder.js',
        ['next']),
      listNode('fmList'),
      fn('fmPick', 'Pick the format file', 'b5-format-pick.js',
        ['next', 'SITE SCOPE']),
      readStep('fmRead', 'Read Format List file'),
      csvNode('fmCsv'),
      fn('fmLookup', 'Build format lookup', 'b5-format-lookup.js', ['next']),
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

// The rows of the table lanes that call monthEnd(..., true) (and steps,
// e.g. the Run Rate grouping) go to the tab EU OEE Fact write.
export function factLane(b, r, tabKey, steps = []) {
  b.lane(r++, 'TO EU OEE FACT',
    'the rows each table writes to report/ (the line source of this tab) also go to the tab EU OEE Fact write, which maps them to the 65 columns of EU_OEE_Fact and writes one file per site, day and record type. Its own DRY_RUN decides; nothing here writes.',
    [
      linkInStep('FACT'),
      ...steps,
      {
        t: 'raw',
        key: 'factOut',
        node: {
          type: 'link out',
          name: `to ${FACT_LINK_NAME}`,
          mode: 'link',
          links: [FACT_LINK_IN_ID]
        }
      }
    ]);
  // give the link out its fixed id (and fix the wire that points to it)
  const made = b.id('factOut');
  const fixed = FACT_LINK_OUT_IDS[tabKey];
  b.nodes.forEach((n) => {
    if (n.id === made) {
      n.id = fixed;
    }
    n.wires = (n.wires || []).map((w) => w.map((x) => x === made ? fixed : x));
  });
  return r;
}
