// Builds the importable VFC flow of the shift report (the line and its machines):
//   flows/vfc-rpt-<site>.json  per site and production day:
//     rpt_window (asset x window), rpt_hour (asset x hour), rpt_event (stop)
// The production day starts at dayStartLocal o'clock local time (Config).
// Usage: node scripts/build-vfc-rpt-flows.js
// Phase 2: the machines of a line come in by themselves (the OEE assets below
// it, minus reportExcludeNames of the Config tab).
// Function code: scripts/vfc/q*.js, plus the s*, d* nodes of the Power BI
// daily flow that read the KPIs, shifts, products, orders and stops (they
// use msg.dayFromMs and msg.dayToMs when the day list sets them).
// Function nodes in the VFC have NO fetch, require or process, so every API
// call is an http request node. No loops. One lane per row, left to right.
import {
  writeFileSync, mkdirSync, existsSync, readFileSync
} from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  code, makeBuilder, fn, http, linkInStep, end, split, delay, join,
  kpiPartsSteps, statusStep,
  addLogLanes, applyLayout, compactLanes, measureSpacing
} from './lib-flow-builder.js';
import { windowSchema, hourSchema, eventSchema } from './lib-rpt-schemas.js';

// Seconds between two days of a run. Days that overlap in time made the
// run stall in the VFC (2026-10-22: a backfill of 2 days 5 s apart stopped
// after 80 s with no error, the same day alone finished in 40 s). A day
// takes 40 s or more, so the next day starts after the previous one.
const DAY_PACE_SECONDS = 60;

// One entry per site. The tab runs at runHourLocal of the site in 1.1
// CONFIG, local clock: an hourly tick (minute 17, after the SIH report daily
// tab at minute 7) and node 1.1 checks the hour.
const SITES = [{ name: 'Hull' }];
const TICK = '17 * * * *';

// Parquet, path and write object: the end of a table lane.
const tableEnd = (table, schema, pathFile) => [
  { t: 'parquet', key: `${table}_pq`, table, schema },
  fn(`${table}_path`, `Set ${table} path`, pathFile, ['next'],
    { __TABLE__: table }),
  { t: 'write', key: `${table}_write`, table }
];

function buildFlow(site, index) {
  const b = makeBuilder(330 + index);
  const { add, id, stableId, col, rowY, comment, lane, linkOut } = b;
  const flowName = `rpt-${site.name.toLowerCase()}`;
  let r = 1;

  const stage1 = b.nextStage();
  comment(
    `[${stage1}] TRIGGERS & SITE SETTINGS`,
    `STAGE ${stage1} - TRIGGERS AND SITE SETTINGS. Site ${site.name}. Writes the three SHIFT REPORT tables from the Insights Hub API, one file per table and production day: rpt_window (asset x window: the day and each shift run), rpt_hour (asset x hour) and rpt_event (one row per stop). Phase 1: the report lines of the Config tab (reportLineIds), no machines yet. The production day starts at dayStartLocal o'clock local time (Config, timeZone of the site), so it is 23, 24 or 25 hours long. Schedule: a tick every hour; 1.1 goes on only in the local hour runHourLocal of the site in 1.1 CONFIG (the same local time in summer and winter; no hour: backfill only), then builds the days that have ended and the days before them (REBUILD_DAYS in 1.1). Backfill: edit the inject payload {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"} (production days) and click the button. Both go through 1.1 SITE SETTINGS, the only node of this flow to edit: site name, dry-run switch, rebuild days, folder names. The shared settings (credentials, root folder, platform, planned reason roots, the lines, day start and time zone of the site) come from the Config tab through global context. dryRun is true by default: set it to false to write files. 1.2 sends ONE MESSAGE PER DAY with its exact window (dayFromMs, dayToMs); the delay node starts one day every 5 s.`,
    r
  );
  const inject = (name, dy, extra) => add({
    id: b.newId(), type: 'inject', name, topic: '', repeat: '',
    repeatEnd: '0', endTime: '0', offset: 'NaN', once: false, properties: '',
    timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false,
    powerMode: false, x: col(0), y: rowY(r) + dy, wires: [[id('settings')]],
    ...extra
  });
  inject('Tick every hour', -40, {
    payload: '', payloadType: 'date', crontab: TICK
  });
  inject('Backfill (edit payload)', 40, {
    payload: '{"start":"2026-09-01","end":"2026-09-03"}',
    payloadType: 'json', crontab: ''
  });
  add({
    id: id('settings'), type: 'function',
    name: '1.1 SITE SETTINGS (edit here)',
    func: code('q1-settings.js').replace('__SITE__', site.name),
    outputs: 1, language: 'javascript', noerr: 0, x: col(1), y: rowY(r),
    wires: [[id('daysFn')]]
  });
  add({
    id: id('daysFn'), type: 'function', name: '1.2 Build day list',
    func: code('q1-build-days.js'), outputs: 1, language: 'javascript',
    noerr: 0, x: col(2), y: rowY(r), wires: [[stableId('queueStatus')]]
  });
  add({
    id: stableId('queueStatus'), type: 'function',
    name: '1.3 Note status: day list built',
    func: code('u1-note-status.js')
      .replaceAll('__FLOW__', flowName)
      .replaceAll('__SITE__', site.name)
      .replaceAll('__STEP__', 'day list built')
      .replaceAll('__ACTION__', 'queue'),
    outputs: 1, language: 'javascript', noerr: 0, x: col(3),
    y: rowY(r), wires: [[id('dayDelay')]]
  });
  add({
    id: stableId('rptBackfillIn'),
    type: 'link in',
    name: `${flowName} BACKFILL`,
    links: [],
    x: col(0),
    y: rowY(r) + 80,
    wires: [[id('settings')]]
  });
  add({
    id: id('dayDelay'), type: 'delay', name: `One day per ${DAY_PACE_SECONDS} s`,
    pauseType: 'rate', timeout: String(DAY_PACE_SECONDS), timeoutUnits: 'seconds',
    rate: '1', nbRateUnits: String(DAY_PACE_SECONDS), rateUnits: 'second', randomFirst: '1', randomLast: '5',
    randomUnits: 'seconds', drop: false, powerMode: false, x: col(4),
    y: rowY(r), wires: [[linkOut('DAY', col(5), rowY(r))]]
  });
  r++;

  lane(r++, 'DAY SETUP',
    'one message per day: token request, OEE asset list (2.3 keeps a short copy of it), choose the report lines of the Config tab, one message per line (one per second). 2.5 asks Asset Management for the machines below the line, 2.6 packs the answer with its line, a join waits for the lists of all lines and 2.7 sends one message per asset: every line and every child that is a configured OEE asset and is not in reportExcludeNames of the Config tab (machines come in by themselves). The messages of the day form one group (msg.parts), so the join of stage 10 waits for all of them without keeping any rows in the flow context (the context accepts 2 MB per value only). Function nodes cannot use fetch in the VFC, so every call is an http request node: the function before it sets msg.method, msg.url and msg.headers. A failure goes to the LOG and nothing is written for that day.',
    [
      linkInStep('DAY'),
      statusStep('daySetupStatus', flowName, site.name, 'DAY SETUP'),
      fn('tokenFn', 'Build token request', 's2-token-request.js', ['next']),
      http('tokenHttp', 'POST token'),
      fn('listFn', 'Build asset list request', 's2-asset-list-request.js',
        ['next', 'LOG']),
      http('listHttp', 'GET OEE assets'),
      fn('keepFn', 'Keep OEE list', 'q2-keep-oee-list.js', ['next']),
      fn('chooseFn', 'Choose assets', 's2-choose-assets.js', ['next', 'LOG']),
      split('split'),
      delay('lineDelay', 'One line per second'),
      fn('childReqFn', 'Build machine list request', 'q2-children-request.js',
        ['next']),
      http('childHttp', 'GET machines of the line'),
      fn('packFn', 'Pack machine list with line', 'q2-pack-children.js',
        ['next']),
      join('childJoin', 'Wait for the machine lists of all lines'),
      fn('expandFn', 'Expand to machines', 'q2-expand-machines.js',
        ['next', 'LOG']),
      delay('assetDelay', 'One asset per second'),
      end('ASSET')
    ]);
  lane(r++, 'ASSET KPIs',
    'one asset. 3.1 and 3.2: Asset Management GET asset (hierarchyPath), then evaluateKPIs POST over the exact window of the day (read-style, groupedByDateTime=true, recursive=false, no ORDER filter). 3.3 checks the response, 3.4 pivots it to one entry per hour. Every asset ends at the join, also when skipped or failed (link "to JOIN"), so the join never waits for a missing message.',
    [
      linkInStep('ASSET'),
      fn('assetFn', 'Build asset request', 's3-asset-request.js', ['next']),
      http('assetHttp', 'GET asset (hierarchy)'),
      fn('kpiReqFn', 'Build KPI request', 's3-kpi-request.js',
        ['next', 'JOIN']),
      http('kpiHttp', 'POST evaluateKPIs'),
      fn('kpiSizeFn', 'Check day size', 'd9-kpi-size.js',
        ['KPI CHECK', 'KPI PARTS'])
    ]);
  lane(r++, 'KPI PARTS',
    'the day evaluateKPIs call answered HTTP 413 (Request Entity Too Large: too many status changes for one call). The same KPIs are asked again hour by hour (one call per hour of the day window, one per second), a join waits for all hours and the answers are merged into one day answer (the hourly groups of every KPI, the same shape as the day call), which goes on to the check node of the day call. If an hourly call fails too, the day fails (no half days) and the log says "also on 1 h windows". The asset note in the log says "KPIs in n hourly parts".',
    kpiPartsSteps('KPI', 'KPI CHECK', flowName, site.name));
  lane(r++, 'KPI CHECK',
    'the day answer of evaluateKPIs (from the day call or merged from the hourly parts) is checked, then pivoted to one entry per hour. A failed call ends at the join (link "to JOIN").',
    [
      linkInStep('KPI CHECK'),
      fn('kpiCheckFn', 'Check KPI response', 's3-check-kpi.js',
        ['next', 'JOIN']),
      fn('pivotFn', 'Pivot KPI results', 's3-pivot-kpi.js', ['next']),
      end('SHIFT')
    ]);
  lane(r++, 'ASSET SHIFTS',
    'one asset. The shift of an hour comes from the calendar of the asset. 4.1 asks the OEE config for the calendar id and the product collection id, 4.2 asks the calendar events that cover the production day, 4.3 turns them into shift rules (freq, interval, start, until, duration). A failed call or an asset without a calendar fails the day (link "to JOIN").',
    [
      linkInStep('SHIFT'),
      fn('cfgFn', 'Build config request', 'd4-config-request.js', ['next']),
      http('cfgHttp', 'GET asset config'),
      fn('evFn', 'Build calendar events request', 'd4-events-request.js',
        ['next', 'JOIN']),
      http('evHttp', 'GET calendar events'),
      fn('rulesFn', 'Build shift rules', 'd4-shift-rules.js',
        ['next', 'JOIN']),
      end('PRODUCTS')
    ]);
  lane(r++, 'ASSET PRODUCTS',
    'one asset. 5.1 asks filterValues for the products and orders of the production day (the lists behind the Product and Order dropdowns of the OEE app). 5.2 checks the answer and asks the product list (name, code, description, design speed) of the product collection of the asset. A day without any product or order goes straight to "to ASSIGN"; an asset without a product collection goes on without master data ("to VALUES"). A failed call fails the day (link "to JOIN").',
    [
      linkInStep('PRODUCTS'),
      fn('valReqFn', 'Build filter values request', 'd7-values-request.js',
        ['next']),
      http('valHttp', 'GET filter values'),
      fn('prodReqFn', 'Build product list request', 'd7-products-request.js',
        ['next', 'VALUES', 'ASSIGN', 'JOIN']),
      http('prodHttp', 'GET product list'),
      end('VALUES')
    ]);
  lane(r++, 'VALUE KPIs',
    'one asset. 6.1 keeps the master data of the products of the day and sends ONE MESSAGE PER PRODUCT AND PER ORDER (one per second). 6.2 builds the evaluateKPIs POST (read-style, hourly) filtered on that product or order. Every value message carries msg.parts of its asset group; the msg.parts of the asset (day join) waits in msg.assetParts. A failed call fails the day (link "to JOIN").',
    [
      linkInStep('VALUES'),
      fn('valMsgFn', 'Build value messages', 'd7-value-messages.js',
        ['next', 'ASSIGN', 'JOIN']),
      delay('valDelay', 'One value per second'),
      fn('valKpiFn', 'Build value KPI request', 'd7-value-request.js',
        ['next']),
      http('valKpiHttp', 'POST evaluateKPIs (one value)'),
      fn('valSizeFn', 'Check day size', 'd9-kpi-size.js',
        ['VALUE CHECK', 'VALUE PARTS'])
    ]);
  lane(r++, 'VALUE PARTS',
    'the same hourly fallback for the evaluateKPIs call of one product or order that answered 413: hour by hour, joined, merged, then on to the collect node of the value calls. A separate lane from the day KPIs: one shared lane would make a loop.',
    kpiPartsSteps('VALUE', 'VALUE CHECK', flowName, site.name));
  lane(r++, 'VALUE CHECK',
    'the answer of one product or order call (from the call or merged from the hourly parts): 1 packs its hours with parts, the join waits for every value of the asset (no flow context: overlapping days lost updates there), 2 collects them and gives the asset its msg.parts back. A failed call fails the day (link "to JOIN").',
    [
      linkInStep('VALUE CHECK'),
      fn('valPackFn', 'Pack value hours', 'd7-value-pack.js', ['next']),
      join('valJoin', 'Wait for all values'),
      fn('valCollectFn', 'Collect value hours', 'd7-collect.js',
        ['next', 'JOIN']),
      end('ASSIGN')
    ]);
  lane(r++, 'ASSIGN & ROWS',
    'one asset. 7.1 gives every hour its product and order: the value that has parts in that hour; an hour without parts takes the value of the hour before it (the first hours take the next value). 7.2 adds the shift and the design speed per minute to every hour. 7.3 builds the rpt_hour rows (one per hour, local date and time, minutes, speed, capacity). 7.4 builds the rpt_window rows: the production day and every run of hours in the same shift, from the SUMS of the hourly KPIs; the ratios (availability = net production time / operational time, performance = total / theoretical output, quality = good / total, OEE = the three multiplied) are calculated again from the sums, the same formulas as the OEE app, so no extra API call is needed.',
    [
      linkInStep('ASSIGN'),
      fn('assignFn', 'Assign hours to products', 'd7-assign-hours.js',
        ['next']),
      fn('tagFn', 'Tag hours with shift and speed', 'q7-tag-hours.js',
        ['next']),
      fn('hourRowsFn', 'Build hour rows', 'q7-hour-rows.js', ['next']),
      fn('windowRowsFn', 'Build window rows', 'q7-window-rows.js', ['next']),
      end('SEGMENTS')
    ]);
  lane(r++, 'ASSET SEGMENTS',
    'one asset. A line goes straight on ("to STOPS"). A machine: 8.1 asks the time segments of the day (timeModelCategoryDistribution, read-style POST, one answer for the whole day), 8.2 adds the minutes per group to every window row: Run = ran, Unplanned Downtime = faults, Lack of resources = waiting, Planned Downtime = planned, everything else (also a segment without a category) = other. The segments are cut to the window (day and each shift run). operator_min stays empty: Insights Hub has no category for operator stops (the reason of a stop comes from the machine status mapping), so operator stops are counted in the groups above until Reckitt defines a rule. A failed call fails the day (link "to JOIN").',
    [
      linkInStep('SEGMENTS'),
      fn('segReqFn', 'Build time segments request', 'q8-segments-request.js',
        ['next', 'STOPS']),
      http('segHttp', 'POST timeModelCategoryDistribution'),
      fn('segGroupsFn', 'Add group minutes', 'q8-segments-groups.js',
        ['next', 'JOIN']),
      end('STOPS')
    ]);
  lane(r++, 'ASSET STOPS',
    'one asset. 9.1 downtimeReasons GET over the exact window of the day (size 5000, one page), 9.2 checks the response, 9.3 builds the rpt_event rows (one per stop that starts inside the production day: UTC and local time, shift, kind microstop, planned or unplanned, reason and reason path, minutes, comment count, product and order of the hour of the stop, loss units = design speed per minute x minutes), 9.4 builds the result of the asset and sends it to the wait node (link "to JOIN").',
    [
      linkInStep('STOPS'),
      statusStep('stopsStatus', flowName, site.name, 'ASSET STOPS'),
      fn('stopsReqFn', 'Build stops request', 's4-stops-request.js', ['next']),
      http('stopsHttp', 'GET downtimeReasons'),
      fn('stopsCheckFn', 'Check stops response', 's4-check-stops.js',
        ['next', 'JOIN']),
      fn('eventRowsFn', 'Build event rows', 'q8-event-rows.js', ['next']),
      fn('resultFn', 'Build asset result', 'q8-asset-result.js', ['next']),
      end('JOIN')
    ]);
  lane(r++, 'JOIN & BUILD TABLES',
    'the join waits for all assets of the day (the lines and their machines). 10.1 collects the results, 10.2 decides: it writes NOTHING if any asset failed (no half days) and nothing in dry-run mode, 10.3 builds one message per table. Output 1 of 10.3 = rpt_window, 2 = rpt_hour, 3 = rpt_event, 4 = log.',
    [
      linkInStep('JOIN'),
      statusStep(
        'assetDoneStatus',
        flowName,
        site.name,
        'JOIN & BUILD TABLES',
        'asset-done'
      ),
      join('dayJoin', 'Wait for all assets of the day'),
      fn('collectFn', 'Collect results', 'q9-collect.js', ['next']),
      fn('decideFn', 'Decide day', 'q9-decide.js', ['next', 'LOG']),
      fn('tablesFn', 'Build table messages', 'q9-table-messages.js',
        [
          'WRITE rpt_window',
          'WRITE rpt_hour',
          'WRITE rpt_event',
          'LOG'
        ], {}, true)
    ]);
  const writes = [
    ['rpt_window', windowSchema, 'asset x window: the day and each shift run'],
    ['rpt_hour', hourSchema, 'asset x hour'],
    ['rpt_event', eventSchema, 'one row per stop']
  ];
  writes.forEach(([table, schema, what]) => {
    lane(r++, `WRITE ${table}`,
      `parquet node, path and write object for ${table} (${what}). The path is <root>/shift_report/${table}/site=<site>/${table}_<production day>.parquet, the same on every rerun, so a rerun replaces the day. Types: UTF8 (STRING), INT64, DOUBLE, TIMESTAMP_MILLIS. Days are text YYYY-MM-DD.`,
      [linkInStep(`WRITE ${table}`), ...tableEnd(table, schema, 's6-set-path.js')]);
  });
  addLogLanes(b, r, flowName, false, {
    site: site.name,
    kind: 'day'
  });

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: `${site.name} shift report`,
    disabled: false, allowCycles: false,
    info: `Writes the three shift report tables of site ${site.name} from the Insights Hub API (phase 1: the report lines). Read calls only. Needs the Config tab.`
  });
  return b.nodes;
}

// ---------- validation and output ----------
mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
for (const [index, site] of SITES.entries()) {
  const file = `vfc-rpt-${site.name.toLowerCase()}.json`;
  const nodes = buildFlow(site, index);
  // Layout rule of lib-flow-builder.js. A saved layout (below) wins.
  compactLanes(nodes);
  const layoutUrl = new URL(`../flows/layouts/${file}`, import.meta.url);
  if (existsSync(layoutUrl)) {
    applyLayout(nodes, JSON.parse(readFileSync(layoutUrl, 'utf8')));
  }
  const { errors, warnings, stats } = validateFlow(nodes);
  if (errors.length) {
    throw new Error(`flow check failed for ${file}:\n  ${errors.join('\n  ')}`);
  }
  writeFileSync(new URL(`../flows/${file}`, import.meta.url),
    JSON.stringify(nodes, null, 2) + '\n');
  console.log(
    `written flows/${file}: ${stats.nodes} nodes, ${stats.linkIn} link in / ` +
      `${stats.linkOut} link out, longest line ${stats.longestLine}`
  );
  warnings.forEach((w) => console.log(`warn: ${w}`));
  const spacing = measureSpacing(nodes, 0);
  console.log(`  spacing: ${spacing.overlaps} node pairs overlap by the estimate`);
}
