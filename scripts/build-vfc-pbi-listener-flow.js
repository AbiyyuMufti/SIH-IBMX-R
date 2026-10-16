// Builds flows/vfc-pbi-listener.json, the VFC tab "PBI report listener": the
// lake watcher of the PBI report build (step 4) and the JOB DONE watch.
// Two subscribe object nodes (source files, reference files) feed one
// collector; a clock turns the entries whose wait window is over into jobs
// and puts them in global context "jobQueue". The tab "PBI report build"
// takes one job every 10 s from that queue (node 1.0 Take queued job).
// It is a second tab because a VFC workspace holds 200 nodes at most.
// Usage: node scripts/build-vfc-pbi-listener-flow.js
// Function code: scripts/vfc/w*.js. Do not edit the JSON.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  makeBuilder, fn, linkInStep, end, rawStep, debugStep,
  applyLayout, compactLanes, measureSpacing
} from './lib-flow-builder.js';

const FILE = 'vfc-pbi-listener.json';

const subscribe = (name, path) => ({
  type: 'subscribe object', name, path, powerMode: false
});

const clock = (name, seconds) => ({
  type: 'inject', name, topic: '', payload: '', payloadType: 'date',
  repeat: String(seconds), repeatEnd: '0', endTime: '0', crontab: '',
  offset: 'NaN', once: false, properties: '', timezone: 'UTC',
  betweentimesunit: 'm', showNextExecution: false, powerMode: false
});

function buildFlow() {
  const b = makeBuilder(350);
  const { lane } = b;
  let r = 1;

  lane(r++, 'LISTEN: SOURCE FILES',
    'a subscribe object node on eu_report/pbi_report/source/ (all subfolders) sends one message per file event. The event is kept when it is a MODIFY (new or replaced file) of a plan_opt, line_losses or volume_loss_correction month file; the site and the month come from the path. Deletes and other files are dropped.',
    [
      rawStep('wSourceSub', subscribe('Source files changed',
        '/eu_report/pbi_report/source/')),
      fn('wSourceEvent', 'Read source event', 'w1-source-event.js', ['next']),
      end('EVENT')
    ]);
  lane(r++, 'LISTEN: REFERENCE FILES',
    'a subscribe object node on eu_report/reference/ (all subfolders). Kept: a MODIFY of a machine_names, shift_naming, glidepaths or equipment_coding file; the type and the site come from the path.',
    [
      rawStep('wReferenceSub', subscribe('Reference files changed',
        '/eu_report/reference/')),
      fn('wReferenceEvent', 'Read reference event', 'w1-reference-event.js',
        ['next']),
      end('EVENT')
    ]);
  lane(r++, 'LISTEN: COLLECT',
    'every event is kept in flow context (one entry per site and month, or per reference type and site; repeated events of the same file count once). LISTENERS_ON in this node switches the watcher off (for example during a bulk upload).',
    [
      linkInStep('EVENT'),
      fn('wCollect', 'Collect events', 'w2-collect.js', [])
    ]);
  lane(r++, 'LISTEN: JOBS',
    'a clock looks every 30 s for entries whose wait window is over (120 s for source files, 300 s for reference files, both counted from the first event) and turns them into jobs: months of one site that follow each other become one job; a reference change rebuilds the current month and the months before it (REFERENCE_MONTHS_BACK in node Release due events). The jobs are put in global context jobQueue; node 1.0 of the tab PBI report build takes one every 10 s and runs it like the inject. The debug node shows one line per job.',
    [
      rawStep('wClock', clock('Release check every 30 s', 30)),
      fn('wRelease', 'Release due events', 'w3-release.js', ['next']),
      debugStep('wLog', 'Listener log', 'payload')
    ]);
  lane(r++, 'JOB DONE',
    'a clock checks every 10 s when the newest log line of the tab PBI report build was written (node Note last log line there, global context lastLog). When no log line came for 30 s the debug node JOB DONE shows one line; the next log line re-arms it. It means "quiet", not "all written": look at the log for errors.',
    [
      rawStep('quietClock', clock('Check every 10 s', 10)),
      fn('quietCheck', 'Check quiet', 'w5-check-quiet.js', ['next']),
      debugStep('jobDone', 'JOB DONE', 'payload')
    ]);

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'PBI report listener',
    disabled: false, allowCycles: false,
    info: 'Lake watcher of the PBI report build: file events of the data lake become jobs for the tab PBI report build (global context jobQueue). Also the JOB DONE watch. No API calls.'
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
