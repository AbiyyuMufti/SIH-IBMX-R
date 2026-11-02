// Builds flows/vfc-provideam-fetch.json, the VFC tab "Provideam fetch": it
// calls the Provideam report API for every site, report type and production
// day, writes the source CSV files of the day (the text the SharePoint
// exports had) to <root>/pbi_report/source, then sends one job {sites, days}
// to the two PBI report build tabs (docs/provideam-fetch.md).
// Usage: node scripts/build-vfc-provideam-fetch.js
// Function code: scripts/vfc/f*.js. Do not edit the JSON. Needs the Config
// tab (global settings, provideam.apiKey).
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  code, makeBuilder, fn, linkInStep, split, delay, readStep, http,
  joinTimeout, waitStep, writeStep, addLogLanes, applyLayout, compactLanes,
  measureSpacing
} from './lib-flow-builder.js';

const FLOW_ID = 'provideam-fetch';
const FILE = 'vfc-provideam-fetch.json';
// The build tabs take the job through their BACKFILL link in. The link outs
// are connected by hand after import, as the Run monitor's.
const BUILD_LINKS = ['pbi-report', 'pbi-report-2'];

function buildFlow() {
  const b = makeBuilder(370);
  const { add, id, stableId, col, rowY, comment, lane, linkOut } = b;
  let r = 1;

  const stage1 = b.nextStage();
  comment(
    `[${stage1}] TRIGGERS & FETCH SETTINGS`,
    `STAGE ${stage1} - TRIGGERS AND FETCH SETTINGS. The clock runs every day at 07:00 UTC and fetches the last 3 production days (DAYS_BACK in 1.1, again every day so late corrections arrive). Backfill: edit the inject payload {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"} (production days, optional "sites") and click it; the Run monitor sends the same through the link in BACKFILL. 1.1 is the only node to edit: sites, days, dry run (true by default: nothing is written and no build starts). The API key is in 1.1 CONFIG of the Config tab. 1.1 sends one task per day, site and report type (plan OPT, run rates, line losses, loss correction).`,
    r
  );
  const inject = (name, dy, extra) => add({
    id: b.newId(), type: 'inject', name, topic: '', repeat: '',
    repeatEnd: '0', endTime: '0', offset: 'NaN', once: false,
    properties: '', timezone: 'UTC', betweentimesunit: 'm',
    showNextExecution: false, powerMode: false, x: col(0),
    y: rowY(r) + dy, wires: [[id('settings')]], ...extra
  });
  inject('Every day 07:00 UTC', -40, {
    payload: '', payloadType: 'date', crontab: '0 7 * * *'
  });
  inject('Backfill (edit payload)', 40, {
    payload: '{"start":"2026-11-01","end":"2026-11-02"}',
    payloadType: 'json', crontab: ''
  });
  add({
    id: stableId('provideamFetchBackfillIn'), type: 'link in',
    name: `${FLOW_ID} BACKFILL`, links: [], x: col(0), y: rowY(r) + 80,
    wires: [[id('settings')]]
  });
  add({
    id: id('settings'), type: 'function',
    name: '1.1 FETCH SETTINGS (edit here)', func: code('f1-fetch-settings.js'),
    outputs: 1, language: 'javascript', noerr: 0, x: col(1), y: rowY(r),
    wires: [[linkOut('TASKS', col(2), rowY(r))]]
  });
  r++;

  lane(r++, 'CALLS',
    'one message per task, one every 2 s (Provideam answers in 1 to 7 s; a day of one site and type is at most about 1.3 MB). 1 sets the body file <root>/reference/provideam_reports/site=<Site>/<type>.json (the saved report body, its machines and, for the correction, the loss groups the export keeps), the read node loads it, 2 puts the day in it and builds the POST with the API key of 1.1 CONFIG, 3 turns the answer into the CSV text of the SharePoint export. A missing body file stops the task without an error (read node): the run then waits for the join timeout and the log shows the lost call.',
    [
      linkInStep('TASKS'),
      split('taskSplit'),
      delay('taskDelay', 'One call per 2 s', 2),
      fn('bodyFile', 'Set body file', 'f2-body-file.js', ['next']),
      readStep('bodyRead', 'Read body file'),
      fn('request', 'Build Provideam request', 'f3-build-request.js',
        ['next']),
      http('call', 'POST Provideam report'),
      fn('csv', 'Make source CSV', 'f4-make-csv.js',
        ['WRITE', 'RUN DONE', 'LOG'], {}, true)
    ]);
  lane(r++, 'WRITE SOURCE FILE',
    'the day file <root>/pbi_report/source/<type>/site=<Site>/<type>_<YYYY-MM-DD>.csv. A rerun of the day replaces it.',
    [
      linkInStep('WRITE'),
      writeStep('write', 'Source file to data lake')
    ]);
  lane(r++, 'RUN DONE',
    'the join collects the task results and sends when the last task arrives (or after 10 minutes, if a call was lost). 1 counts them and builds the job {sites, days}: a day is built when every type of a site came back. The wait gives the last writes 30 s, then the job goes to the link in BACKFILL of PBI report build and PBI report build 2 (connect the two link outs after import). The build tabs list the source folder and read only the files that exist.',
    [
      linkInStep('RUN DONE'),
      joinTimeout('runJoin', 'Collect task results', 600),
      fn('job', 'Build the build job', 'f5-build-job.js', ['next', 'LOG']),
      waitStep('jobWait', 'Wait for writes 30 s', 30)
    ]);
  const outs = BUILD_LINKS.map((flow, i) => {
    const outId = b.newId();
    add({
      id: outId, type: 'link out', name: `to ${flow} BACKFILL`, mode: 'link',
      links: [], x: col(9), y: rowY(r - 1) + i * 40, wires: []
    });
    return outId;
  });
  b.nodes.find((n) => n.id === id('jobWait')).wires = [outs];
  addLogLanes(b, r, FLOW_ID, true);

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'Provideam fetch',
    disabled: false, allowCycles: false,
    info: 'Calls the Provideam report API every day and writes the source day files of the PBI report build tabs. Needs the Config tab.'
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
