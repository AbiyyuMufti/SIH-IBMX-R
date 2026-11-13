// Builds flows/legacy_report_generator_v0/vfc-eu-oee-fact.json, the VFC tab
// "EU OEE Fact write": it takes the rows the build tabs write to report/
// (PBI report build: Plan, Time Utilisation, Loss; PBI report build 2: the
// Run Rate rows; later Chartres live) through the link in
// "eu-oee-fact WRITE", maps them to the 65 columns of EU_OEE_Fact and writes
// one file per site, day and record type (docs/eu-oee-fact-live-plan.md).
// Usage: node scripts/build-vfc-eu-oee-fact.js
// Function code: scripts/vfc/e*.js and r5-decide.js. Do not edit the JSON.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  makeBuilder, fn, readStep, csvNode, addLogLanes, applyLayout,
  compactLanes, measureSpacing
} from './lib-flow-builder.js';
import { euOeeFactSchema } from './lib-pbi-report-schemas.js';
import {
  FACT_LINK_IN_ID, FACT_LINK_NAME, FACT_LINK_OUT_IDS
} from './lib-pbi-report-lanes.js';

const FLOW_ID = 'eu-oee-fact';
const DIR = 'legacy_report_generator_v0/';
const FILE = 'vfc-eu-oee-fact.json';
const columns = euOeeFactSchema.map(([name]) => `  '${name}'`).join(',\n');

function buildFlow() {
  const b = makeBuilder(390);
  const { id, lane } = b;
  let r = 1;

  lane(r++, 'WRITE EU_OEE_FACT',
    'one table message of a build tab arrives through the link in eu-oee-fact WRITE (the rows that table writes to report/). 1 FACT SETTINGS holds DRY_RUN (true: nothing is written, the log shows what would be) MONTH_JOBS (false: a month job of a build tab writes no fact file, the month files hold the history) and FIRST_DAY (no fact file before the cutover day) and sets the line list file report/Dim/Machine_Names_EU.csv, which is read and parsed. 2 maps the rows to the 65 columns of EU_OEE_Fact: Loss renames (Date -> Event Date, ShiftStartDate -> Date, Shift colour -> Shift Colour, target -> Loss Target), In EU Report Source = the flag of the table, In EU Report = the line is in the line list, Dept / Area / Product Type from the line list (else the row). Then decide, parquet (every column typed, also when empty), the path <root>/report/EU_OEE_Fact/site=<Site>/EU_OEE_Fact_<day>_<plan|tu|loss|rr>_<source>.parquet and write object. A rerun replaces the file.',
    [
      {
        t: 'raw',
        key: 'factIn',
        node: {
          type: 'link in',
          name: FACT_LINK_NAME,
          links: Object.values(FACT_LINK_OUT_IDS)
        }
      },
      fn('settings', 'FACT SETTINGS (edit here)', 'e1-fact-settings.js',
        ['next', 'LOG']),
      readStep('lineRead', 'Read line list'),
      csvNode('lineCsv'),
      fn('factRows', 'Map to fact columns', 'e2-fact-rows.js',
        ['next', 'LOG'], { __COLUMNS__: columns }, true),
      fn('decide', 'Decide EU_OEE_Fact', 'r5-decide.js', ['next', 'LOG'],
        { __TABLE__: 'EU_OEE_Fact' }),
      {
        t: 'parquet', key: 'factPq', table: 'EU_OEE_Fact',
        schema: euOeeFactSchema
      },
      fn('path', 'Set fact file path', 'e3-fact-path.js', ['next']),
      { t: 'write', key: 'factWrite', table: 'EU_OEE_Fact' }
    ]);
  addLogLanes(b, r, FLOW_ID, true);

  // the link in keeps its fixed id, so the other tabs can point to it
  const made = id('factIn');
  b.nodes.forEach((n) => {
    if (n.id === made) {
      n.id = FACT_LINK_IN_ID;
    }
  });
  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'EU OEE Fact write',
    disabled: false, allowCycles: false,
    info: 'Writes EU_OEE_Fact (65 columns, one file per site, day and record type) from the rows of PBI report build, PBI report build 2 and Chartres live. Needs the Config tab.'
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
writeFileSync(new URL(`../flows/${DIR}${FILE}`, import.meta.url),
  JSON.stringify(nodes, null, 2) + '\n');
console.log(
  `written flows/${DIR}${FILE}: ${stats.nodes} nodes, ${stats.linkIn} ` +
    `link in / ${stats.linkOut} link out, longest line ${stats.longestLine}`
);
warnings.forEach((w) => console.log(`warn: ${w}`));
const spacing = measureSpacing(nodes, 0);
console.log(`  spacing: ${spacing.overlaps} node pairs overlap by the estimate`);
