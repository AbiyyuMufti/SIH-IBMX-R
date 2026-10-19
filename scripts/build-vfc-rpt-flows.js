// Builds the importable VFC flow of the shift report, phase 1 (the line):
//   flows/vfc-rpt-<site>.json  per site and production day:
//     rpt_window (asset x window), rpt_hour (asset x hour), rpt_event (stop)
// The production day starts at dayStartLocal o'clock local time (Config).
// Usage: node scripts/build-vfc-rpt-flows.js
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
  addLogLanes, applyLayout, compactLanes, measureSpacing
} from './lib-flow-builder.js';
import { windowSchema, hourSchema, eventSchema } from './lib-rpt-schemas.js';

// One entry per site. cron = the daily schedule (UTC). The day list builds
// the days that ended at least two hours before.
const SITES = [{ name: 'Hull', cron: '0 8 * * *' }];

// Parquet, path and write object: the end of a table lane.
const tableEnd = (table, schema, pathFile) => [
  { t: 'parquet', key: `${table}_pq`, table, schema },
  fn(`${table}_path`, `Set ${table} path`, pathFile, ['next'],
    { __TABLE__: table }),
  { t: 'write', key: `${table}_write`, table }
];

function buildFlow(site, index) {
  const b = makeBuilder(330 + index);
  const { add, id, col, rowY, comment, lane, linkOut } = b;
  let r = 1;

  const stage1 = b.nextStage();
  comment(
    `[${stage1}] TRIGGERS & SITE SETTINGS`,
    `STAGE ${stage1} - TRIGGERS AND SITE SETTINGS. Site ${site.name}. Writes the three SHIFT REPORT tables from the Insights Hub API, one file per table and production day: rpt_window (asset x window: the day and each shift run), rpt_hour (asset x hour) and rpt_event (one row per stop). Phase 1: the report lines of the Config tab (reportLineIds), no machines yet. The production day starts at dayStartLocal o'clock local time (Config, time zone Europe/London), so it is 23, 24 or 25 hours long. Schedule: daily, builds the days that ended at least two hours before (REBUILD_DAYS in 1.1). Backfill: edit the inject payload {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"} (production days) and click the button. Both go through 1.1 SITE SETTINGS, the only node of this flow to edit: site name, dry-run switch, rebuild days, folder names. The shared settings (credentials, root folder, platform, planned reason roots, the lines, day start and time zone of the site) come from the Config tab through global context. dryRun is true by default: set it to false to write files. 1.2 sends ONE MESSAGE PER DAY with its exact window (dayFromMs, dayToMs); the delay node starts one day every 5 s.`,
    r
  );
  const inject = (name, dy, extra) => add({
    id: b.newId(), type: 'inject', name, topic: '', repeat: '',
    repeatEnd: '0', endTime: '0', offset: 'NaN', once: false, properties: '',
    timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false,
    powerMode: false, x: col(0), y: rowY(r) + dy, wires: [[id('settings')]],
    ...extra
  });
  inject(`Schedule ${site.cron}`, -40, {
    payload: '', payloadType: 'date', crontab: site.cron
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
    noerr: 0, x: col(2), y: rowY(r), wires: [[id('dayDelay')]]
  });
  add({
    id: id('dayDelay'), type: 'delay', name: 'One day per 5 s',
    pauseType: 'rate', timeout: '5', timeoutUnits: 'seconds', rate: '1',
    nbRateUnits: '5', rateUnits: 'second', randomFirst: '1', randomLast: '5',
    randomUnits: 'seconds', drop: false, powerMode: false, x: col(3),
    y: rowY(r), wires: [[linkOut('DAY', col(4), rowY(r))]]
  });
  r++;

  lane(r++, 'DAY SETUP',
    'one message per day: token request, OEE asset list, choose the assets (the report lines of the Config tab), one message per asset (one per second). Function nodes cannot use fetch in the VFC, so every call is an http request node: the function before it sets msg.method, msg.url and msg.headers. A failure goes to the LOG and nothing is written for that day.',
    [
      linkInStep('DAY'),
      fn('tokenFn', 'Build token request', 's2-token-request.js', ['next']),
      http('tokenHttp', 'POST token'),
      fn('listFn', 'Build asset list request', 's2-asset-list-request.js',
        ['next', 'LOG']),
      http('listHttp', 'GET OEE assets'),
      fn('chooseFn', 'Choose assets', 's2-choose-assets.js', ['next', 'LOG']),
      split('split'),
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
    'one asset. 6.1 keeps the master data of the products of the day and sends ONE MESSAGE PER PRODUCT AND PER ORDER (one per second). 6.2 builds the evaluateKPIs POST (read-style, hourly) filtered on that product or order. 6.3 keeps the hours that have parts and waits until every value of the asset is in (the state is kept in flow context under valueRuns, so no second split is needed). A failed call fails the day (link "to JOIN").',
    [
      linkInStep('VALUES'),
      fn('valMsgFn', 'Build value messages', 'd7-value-messages.js',
        ['next', 'ASSIGN', 'JOIN']),
      delay('valDelay', 'One value per second'),
      fn('valKpiFn', 'Build value KPI request', 'd7-value-request.js',
        ['next']),
      http('valKpiHttp', 'POST evaluateKPIs (one value)'),
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
      end('STOPS')
    ]);
  lane(r++, 'ASSET STOPS',
    'one asset. 8.1 downtimeReasons GET over the exact window of the day (size 5000, one page), 8.2 checks the response, 8.3 builds the rpt_event rows (one per stop that starts inside the production day: UTC and local time, shift, kind microstop, planned or unplanned, reason and reason path, minutes, comment count, product and order of the hour of the stop, loss units = design speed per minute x minutes), 8.4 builds the result of the asset and sends it to the join.',
    [
      linkInStep('STOPS'),
      fn('stopsReqFn', 'Build stops request', 's4-stops-request.js', ['next']),
      http('stopsHttp', 'GET downtimeReasons'),
      fn('stopsCheckFn', 'Check stops response', 's4-check-stops.js',
        ['next', 'JOIN']),
      fn('eventRowsFn', 'Build event rows', 'q8-event-rows.js', ['next']),
      fn('resultFn', 'Build asset result', 'q8-asset-result.js', ['next']),
      end('JOIN')
    ]);
  lane(r++, 'JOIN & BUILD TABLES',
    'the join waits for all assets of the day. 9.1 collects the results, 9.2 decides: it writes NOTHING if any asset failed (no half days) and nothing in dry-run mode, 9.3 builds one message per table. Output 1 of 9.3 = rpt_window, 2 = rpt_hour, 3 = rpt_event, 4 = log.',
    [
      linkInStep('JOIN'),
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
  addLogLanes(b, r, `rpt-${site.name.toLowerCase()}`);

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
