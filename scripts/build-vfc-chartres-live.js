// Builds flows/vfc-chartres-live.json, the VFC tab "Chartres live": Power
// Automate sends one Base row of an OEE workbook per request, the tab turns it
// into the rows of the report tables with the reference files of the lake and
// writes one file per table, line and day (docs/chartres-live.md).
// Usage: node scripts/build-vfc-chartres-live.js
// Function code: scripts/vfc/y*.js (+ b3-pick-file.js, b5-*-lookup.js shared
// with the PBI report build). Do not edit the JSON by hand. Needs the Config tab.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  makeBuilder, fn, linkInStep, end, split, readStep, listNode, csvNode, rawStep,
  addLogLanes, applyLayout, compactLanes, measureSpacing
} from './lib-flow-builder.js';
import { LIVE_TABLES, columnsSource } from './lib-chartres-live.js';

const FLOW_ID = 'chartres-live';
const FILE = 'vfc-chartres-live.json';
const ENDPOINT = '/chartres-data';

// Parquet, path and write object: the end of a table lane.
const tableEnd = (table, schema) => [
  { t: 'parquet', key: `${table}_pq`, table, schema },
  fn(`${table}_path`, `Set ${table} path`, 'y5-set-path.js', ['next'],
    { __TABLE__: table }),
  { t: 'write', key: `${table}_write`, table }
];

function buildFlow() {
  const b = makeBuilder(380);
  const { add, id, col, rowY, comment, lane } = b;
  let r = 1;

  const stage1 = b.nextStage();
  comment(
    `[${stage1}] TRIGGERS`,
    `STAGE ${stage1} - TRIGGERS. The reference files (Machine Names, Glidepaths, Format List, report scope, loss names) are loaded when the tab starts (5 s after a deploy) and again every hour at minute 7. A request that arrives before they are loaded gets 503 and Power Automate sends it again.`,
    r
  );
  const inject = (name, dy, extra) => add({
    id: b.newId(), type: 'inject', name, topic: '', repeat: '',
    repeatEnd: '0', endTime: '0', offset: 'NaN', once: false,
    properties: '', timezone: 'UTC', betweentimesunit: 'm',
    showNextExecution: false, powerMode: false, x: col(0),
    y: rowY(r) + dy, wires: [[id('settings')]], payload: '',
    payloadType: 'date', ...extra
  });
  inject('At start', -40, { once: true, onceDelay: '5' });
  inject('Every hour', 40, { crontab: '7 * * * *' });
  r++;

  lane(r++, 'REQUEST',
    `${ENDPOINT} (POST) receives one Base row per request. The key of the http in node is generated there after the import, it is not part of this file; delete or disable any other http in node with the same endpoint first. 1.1 SETTINGS (edit here) holds the dry-run switch (true: rows are built and logged, nothing is written). 1.2 reads the row (the line comes from FileName, the day from ANNEE / MOIS / JOUR; a row before the first live day is answered 200 and not written, a bad row 400). 1.3 answers 503 while the reference is not loaded.`,
    [
      rawStep('in', {
        type: 'http in', name: ENDPOINT, endpoint: ENDPOINT, method: 'post',
        upload: false, access: 'key', key: '', users: '', powerMode: false
      }),
      fn('settings', '1.1 SETTINGS (edit here)', 'y0-settings.js',
        ['next', 'REFRESH']),
      fn('readRow', 'Read the row', 'y1-read-row.js', ['next', 'ANSWER']),
      fn('ready', 'Check reference', 'y0-check-ready.js', ['next', 'ANSWER']),
      end('ROW')
    ]);
  lane(r++, 'REFERENCE',
    'one message per reference file type: the folder of the type in <root>/reference is listed, the newest .csv is read and parsed, then the lookup node of the type stores it in flow context. Machine Names, Glidepaths, Format List and report scope use the same lookup nodes as the PBI report build; the loss names (localisation/chartres-losses.csv) have their own. The tab is ready when all five types came in without a failure.',
    [
      linkInStep('REFRESH'),
      fn('refList', 'Start refresh', 'y0-ref-list.js', ['next']),
      split('refSplit'),
      fn('refFolder', 'Set reference folder', 'y0-ref-folder.js', ['next']),
      listNode('refList2'),
      fn('refPick', 'Pick the file', 'b3-pick-file.js', ['next', 'REF DONE']),
      readStep('refRead', 'Read reference file'),
      csvNode('refCsv'),
      fn('refRoute', 'Route by type', 'y0-ref-route.js',
        ['LK MACHINES', 'LK TARGETS', 'LK FORMATS', 'LK SCOPE', 'LK LOSSES'],
        {}, true)
    ]);
  const lookups = [
    ['LK MACHINES', 'Machine Names', 'b5-machine-lookup.js',
      ['next', 'REF DONE'], 'Dept, Area and Product Type of each machine.'],
    ['LK TARGETS', 'Glidepaths', 'b5-target-lookup.js',
      ['next', 'REF DONE'],
      'OEE, downtime and loss targets per line and month (percent).'],
    ['LK FORMATS', 'Format List', 'b5-format-lookup.js',
      ['next'], 'Brand, unit size, case and extra info per product.'],
    ['LK SCOPE', 'report scope', 'b5-scope-lookup.js',
      ['next', 'REF DONE'], 'the In EU Report rules of the site.'],
    ['LK LOSSES', 'loss names', 'y0-loss-lookup.js',
      ['next', 'REF DONE'],
      'English group, sub group, description and equipment of each loss column.']
  ];
  lookups.forEach(([link, name, file, outs, what], i) => {
    lane(r++, `LOOKUP: ${name}`,
      `stores ${what} A failed file goes to REF DONE with the failure.`,
      [linkInStep(link), fn(`lookup${i}`, `Build ${name} lookup`, file, outs),
        end('REF DONE')]);
  });
  lane(r++, 'REFERENCE DONE',
    'counts the five types of the refresh. When all came in without failure the tab is ready for requests; a failure is logged and the previous lookups stay in use.',
    [
      linkInStep('REF DONE'),
      fn('refDone', 'Count lookups', 'y0-ref-done.js', ['LOG'])
    ]);
  lane(r++, 'ROW',
    'the row of one line and day. 3.1 builds the plan rows (one per product slot) and the time row, 3.2 the loss rows (names from the loss names file, shift = the plan shift with the most time), 3.3 the Volume CoV rows and the filler rows that keep the Tableau blend whole, 3.4 sends the rows to the four table lanes and the answer to the sender (nothing is sent to the tables in dry-run mode).',
    [
      linkInStep('ROW'),
      fn('plan', 'Build plan and time rows', 'y2-plan-time.js',
        ['next', 'ANSWER']),
      fn('loss', 'Build loss rows', 'y3-loss-rows.js', ['next', 'ANSWER']),
      fn('cov', 'Build CoV and filler rows', 'y4-cov-filler.js', ['next']),
      fn('route', 'Route the tables', 'y5-route-tables.js',
        ['PLAN TABLE', 'UTIL TABLE', 'LOSS TABLE', 'COV TABLE', 'ANSWER'],
        { 'var COLUMNS = {};': columnsSource() }, true)
    ]);
  const keys = {
    Plan_OPT_EU: 'PLAN TABLE',
    Time_Utilisation_EU: 'UTIL TABLE',
    Daily_Losses_EU: 'LOSS TABLE',
    Volume_CoV_EU: 'COV TABLE'
  };
  Object.entries(LIVE_TABLES).forEach(([table, schema]) => {
    lane(r++, table,
      `parquet node, path and write object for ${table}: <root>/report/${table}/site=Chartres/${table}_<YYYY-MM-DD>_<line>_excel.parquet. The path is the same on every resend of a line and day, so the resend replaces the file.`,
      [linkInStep(keys[table]), ...tableEnd(table, schema)]);
  });
  lane(r++, 'ANSWER',
    'every answer arrives here: 1 sets the status and the body and logs one line per request. A request that was caught in an error gets 500.',
    [
      linkInStep('ANSWER'),
      fn('answer', 'Send answer', 'y6-answer.js', ['next', 'LOG']),
      rawStep('out', {
        type: 'http response', name: 'Answer Power Automate',
        statusCode: '', headers: {}
      })
    ]);
  lane(r++, 'REQUEST ERRORS',
    'an error in a node of the request lane or the row lane is answered with 500 (the sender sends the row again). The shared ERRORS lane below also logs it.',
    [
      rawStep('catchReq', {
        type: 'catch', name: 'Catch request errors', scope: null,
        uncaught: false
      }),
      end('ANSWER')
    ]);
  addLogLanes(b, r, FLOW_ID);

  // The catch node sees only the nodes of the request and row lanes, so an
  // error in the answer node cannot loop back to it.
  const inScope = ['settings', 'readRow', 'ready', 'plan', 'loss', 'cov', 'route']
    .map((k) => id(k));
  b.nodes.find((n) => n.id === id('catchReq')).scope = inScope;

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'Chartres live',
    disabled: false, allowCycles: false,
    info: 'Power Automate sends one Base row of a Chartres OEE workbook per request; the tab writes the report tables of that line and day. Needs the Config tab. Generate the key on the http in node after the import and set DRY_RUN in 1.1 SETTINGS.'
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
