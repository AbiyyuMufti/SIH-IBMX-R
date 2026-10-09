// Builds the two importable VFC flows that write the Power BI tables
// straight from the Insights Hub API (no fact files in between):
//   flows/vfc-pbi-daily-<site>.json  per site and production day:
//     pbi_plan_opt, pbi_time_utilisation, pbi_daily_losses
//   flows/vfc-pbi-reference.json     all sites, weekly:
//     pbi_machine_names, pbi_shift_naming, pbi_calendar
// Usage: node scripts/build-vfc-pbi-flows.js
// Function code: scripts/vfc/d*.js (daily), m*.js (reference), and the
// s*, r*, p1 files that the earlier flows use too. Do not edit the JSON.
// Function nodes in the VFC have NO fetch, require or process, so every API
// call is an http request node. No loops. One lane per row, left to right.
import { writeFileSync, mkdirSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  code, makeBuilder, fn, http, linkInStep, end, split, delay, join,
  addLogLanes
} from './lib-flow-builder.js';
import {
  planSchema, utilSchema, lossSchema, machineSchema, shiftSchema,
  calendarSchema
} from './lib-pbi-schemas.js';

// One entry per site. cron = the daily schedule (UTC), one hour after the
// production day ends, so the day is complete.
const SITES = [{ name: 'Hull', cron: '0 7 * * *' }];

// Parquet, path and write object: the end of a table lane.
const tableEnd = (table, schema, pathFile) => [
  { t: 'parquet', key: `${table}_pq`, table, schema },
  fn(`${table}_path`, `Set ${table} path`, pathFile, ['next'],
    { __TABLE__: table }),
  { t: 'write', key: `${table}_write`, table }
];

// Collect, decide, then the table end: the end of a reference table lane.
const refEnd = (table, schema) => [
  fn(`${table}_collect`, `Collect ${table}`, 'r5-collect.js', ['next']),
  fn(`${table}_decide`, `Decide ${table}`, 'r5-decide.js', ['next', 'LOG'],
    { __TABLE__: table }),
  ...tableEnd(table, schema, 'r6-set-path.js')
];

// ---------- the daily flow of one site ----------
function buildDailyFlow(site, index) {
  const b = makeBuilder(300 + index);
  const { add, id, col, rowY, comment, lane, linkOut } = b;
  let r = 1;

  const stage1 = b.nextStage();
  comment(
    `[${stage1}] TRIGGERS & SITE SETTINGS`,
    `STAGE ${stage1} - TRIGGERS AND SITE SETTINGS. Site ${site.name}. Writes the three DAILY Power BI tables straight from the Insights Hub API: pbi_plan_opt (machine x production day x shift), pbi_time_utilisation (machine x day) and pbi_daily_losses (one row per stop). There are no fact files in between. Schedule: daily, builds yesterday and the days before it (REBUILD_DAYS in 1.1). Backfill: edit the inject payload {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"} (production days) and click the button. Both go through 1.1 SITE SETTINGS, the only node of this flow to edit: site name, dry-run switch, rebuild days, folder prefix. The shared settings (credentials, root folder, asset ids, production-day start, planned reason roots) come from the Config tab through global context. dryRun is true by default: set it to false to write files. 1.2 sends ONE MESSAGE PER DAY; the delay node starts one day every 5 s.`,
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
    func: code('d1-settings.js').replace('__SITE__', site.name),
    outputs: 1, language: 'javascript', noerr: 0, x: col(1), y: rowY(r),
    wires: [[id('daysFn')]]
  });
  add({
    id: id('daysFn'), type: 'function', name: '1.2 Build day list',
    func: code('s1-build-days.js'), outputs: 1, language: 'javascript',
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
    'one message per day: token request, OEE asset list, choose the assets, one message per asset (one per second). Function nodes cannot use fetch in the VFC, so every call is an http request node: the function before it sets msg.method, msg.url and msg.headers. A failure goes to the LOG and nothing is written for that day.',
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
    'one asset. 3.1 and 3.2: Asset Management GET asset (hierarchyPath), then evaluateKPIs POST (read-style, groupedByDateTime=true, recursive=false, no ORDER filter). 3.3 checks the response, 3.4 pivots it to one entry per hour. Every asset ends at the join, also when skipped or failed (link "to JOIN"), so the join never waits for a missing message.',
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
    'one asset. The shift of an hour comes from the calendar of the asset. 4.1 asks the OEE config for the calendar id, 4.2 asks the calendar events that cover the production day, 4.3 turns them into shift rules (freq, interval, start, until, duration), 4.4 groups the hourly KPIs per shift and builds the pbi_plan_opt rows (total time = total minus shift plan stop, planned OpT = operational time, OEE time = used operational time, all in minutes) and the pbi_time_utilisation row. An hour outside every shift gets shift_name null. A failed call or an asset without a calendar fails the day (link "to JOIN").',
    [
      linkInStep('SHIFT'),
      fn('cfgFn', 'Build config request', 'd4-config-request.js', ['next']),
      http('cfgHttp', 'GET asset config'),
      fn('evFn', 'Build calendar events request', 'd4-events-request.js',
        ['next', 'JOIN']),
      http('evHttp', 'GET calendar events'),
      fn('rulesFn', 'Build shift rules', 'd4-shift-rules.js',
        ['next', 'JOIN']),
      fn('planFn', 'Build plan rows', 'd4-plan-rows.js', ['next']),
      end('STOPS')
    ]);
  lane(r++, 'ASSET STOPS',
    'one asset. 5.1 downtimeReasons GET (size 5000, one page), 5.2 checks the response, 5.3 builds the pbi_daily_losses rows (one per stop that starts inside the production day: local date and time, shift, duration in minutes, loss group, sub group, equipment), 5.4 builds the result of the asset and sends it to the join.',
    [
      linkInStep('STOPS'),
      fn('stopsReqFn', 'Build stops request', 's4-stops-request.js', ['next']),
      http('stopsHttp', 'GET downtimeReasons'),
      fn('stopsCheckFn', 'Check stops response', 's4-check-stops.js',
        ['next', 'JOIN']),
      fn('lossFn', 'Build loss rows', 'd5-loss-rows.js', ['next']),
      fn('resultFn', 'Build asset result', 'd5-asset-result.js', ['next']),
      end('JOIN')
    ]);
  lane(r++, 'JOIN & BUILD TABLES',
    'the join waits for all assets of the day. 6.1 collects the results, 6.2 decides: it writes NOTHING if any asset failed (no half days) and nothing in dry-run mode, 6.3 builds one message per table. Output 1 of 6.3 = pbi_plan_opt, 2 = pbi_time_utilisation, 3 = pbi_daily_losses, 4 = log.',
    [
      linkInStep('JOIN'),
      join('dayJoin', 'Wait for all assets of the day'),
      fn('collectFn', 'Collect results', 'd6-collect.js', ['next']),
      fn('decideFn', 'Decide day', 'd6-decide.js', ['next', 'LOG']),
      fn('tablesFn', 'Build table messages', 'd6-table-messages.js',
        [
          'WRITE pbi_plan_opt',
          'WRITE pbi_time_utilisation',
          'WRITE pbi_daily_losses',
          'LOG'
        ], {}, true)
    ]);
  const writes = [
    ['pbi_plan_opt', planSchema, 'Plan OPT EU: machine x production day x shift'],
    ['pbi_time_utilisation', utilSchema, 'Time Utilisation EU: machine x day'],
    ['pbi_daily_losses', lossSchema, 'Daily Losses EU: one row per stop']
  ];
  writes.forEach(([table, schema, what]) => {
    lane(r++, `WRITE ${table}`,
      `parquet node, path and write object for ${table} (${what}). The path is <root>/${table}/<site folder>/${table}_<production day>.parquet, the same on every rerun, so a rerun replaces the day. Types: UTF8 (STRING), INT64, DOUBLE, TIMESTAMP_MILLIS. Dates are text YYYY-MM-DD.`,
      [linkInStep(`WRITE ${table}`), ...tableEnd(table, schema, 's6-set-path.js')]);
  });
  addLogLanes(b, r, `pbi-${site.name.toLowerCase()}`);

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: `${site.name} Power BI daily`,
    disabled: false, allowCycles: false,
    info: `Writes the three daily Power BI tables of site ${site.name} straight from the Insights Hub API. Read calls only. Needs the Config tab.`
  });
  return b.nodes;
}

// ---------- the reference flow (all sites) ----------
function buildReferenceFlow() {
  const b = makeBuilder(310);
  const { add, id, col, rowY, comment, lane, linkOut } = b;
  const tables = ['pbi_machine_names', 'pbi_shift_naming', 'pbi_calendar'];
  let r = 1;

  const stage1 = b.nextStage();
  comment(
    `[${stage1}] TRIGGER & TASK SETTINGS`,
    `STAGE ${stage1} - TRIGGER AND TASK SETTINGS. Writes the three reference Power BI tables straight from the Insights Hub API: pbi_machine_names (one row per machine, all sites of the Config tab), pbi_shift_naming (the distinct shift names of their calendars) and pbi_calendar (generated, no API call). Schedule: weekly, Monday 07:00 UTC. The Run now button starts it by hand. Both go through 1.1 TASK SETTINGS: the dry-run switch per table and the calendar range. The shared settings (credentials, sites, asset ids, root folder) come from the Config tab through global context. dryRun is true by default. Every table file has a fixed name, so every run replaces it.`,
    r
  );
  const inject = (name, dy, crontab) => add({
    id: b.newId(), type: 'inject', name, topic: '', payload: '',
    payloadType: 'date', repeat: '', repeatEnd: '0', endTime: '0', crontab,
    offset: 'NaN', once: false, properties: '', timezone: 'UTC',
    betweentimesunit: 'm', showNextExecution: false, powerMode: false,
    x: col(0), y: rowY(r) + dy, wires: [[id('settings')]]
  });
  inject('Weekly Mon 07:00 UTC', -40, '0 7 * * 1');
  inject('Run now', 40, '');
  const dryRun = tables.map((t, i) =>
    `  ${t}: true${i < tables.length - 1 ? ',' : ''}`).join('\n');
  add({
    id: id('settings'), type: 'function', name: '1.1 TASK SETTINGS (edit here)',
    func: code('m1-settings.js').replace('__DRY_RUN__', dryRun), outputs: 1,
    language: 'javascript', noerr: 0, x: col(1), y: rowY(r),
    wires: [[id('runFn'), id('calFn')]]
  });
  add({
    id: id('runFn'), type: 'function', name: '1.2 Build run message',
    func: code('r1-run-message.js'), outputs: 1, language: 'javascript',
    noerr: 0, x: col(2), y: rowY(r),
    wires: [[linkOut('SETUP', col(3), rowY(r))]]
  });
  // The calendar node reads the dry-run switch of its own table.
  add({
    id: id('calFn'), type: 'function', name: '1.3 Build calendar rows',
    func: code('p1-build-calendar.js').replace(
      'if (cfg.dryRun) {', 'if (cfg.dryRun.pbi_calendar) {'),
    outputs: 2, language: 'javascript', noerr: 0, x: col(2),
    y: rowY(r) + 100,
    wires: [
      [linkOut('WRITE pbi_calendar', col(3), rowY(r) + 100)],
      [linkOut('LOG', col(3), rowY(r) + 160)]
    ]
  });
  r++;

  lane(r++, 'SETUP',
    'token request, OEE asset list, choose the assets, one message per asset. Function nodes cannot use fetch in the VFC, so every call is an http request node: the function before it sets msg.method, msg.url and msg.headers. A failure goes to the LOG and nothing is written.',
    [
      linkInStep('SETUP'),
      fn('tokenFn', 'Build token request', 's2-token-request.js', ['next']),
      http('tokenHttp', 'POST token'),
      fn('listFn', 'Build asset list request', 's2-asset-list-request.js',
        ['next', 'LOG']),
      http('listHttp', 'GET OEE assets'),
      fn('chooseFn', 'Choose assets', 'r2-choose-assets.js', ['next', 'LOG']),
      split('split'),
      delay('assetDelay', 'One asset per second'),
      end('ASSET')
    ]);
  lane(r++, 'ASSET',
    'one message per asset, two calls: Asset Management GET asset (hierarchyPath: site, area, line, machine) and OEE config (the calendar id). An excluded or unconfigured asset skips the config call and goes straight to 4.1 ("to BUILD").',
    [
      linkInStep('ASSET'),
      fn('assetFn', 'Build asset request', 's3-asset-request.js', ['next']),
      http('assetHttp', 'GET asset (hierarchy)'),
      fn('cfgReqFn', 'Save hierarchy, ask config',
        'r3-asset-config-request.js', ['next', 'BUILD']),
      http('cfgHttp', 'GET asset config'),
      end('BUILD')
    ]);
  lane(r++, 'BUNDLES & ROUTE',
    'one bundle per asset: the machine name row and the calendar id. The join waits for all assets. 4.2 sends one message per table: output 1 pbi_machine_names, output 2 the calendar ids for pbi_shift_naming.',
    [
      linkInStep('BUILD'),
      fn('itemsFn', 'Build asset items', 'm4-asset-items.js', ['next']),
      join('bundleJoin', 'Wait for all assets'),
      fn('routeFn', 'Route to tables', 'm4-route.js',
        ['MACHINES', 'CALENDAR IDS'], {}, true)
    ]);
  lane(r++, 'pbi_machine_names',
    'collect the machine rows, decide (nothing is written when an asset failed, nothing in dry-run mode), write the parquet file. Machine Names EU: site, area, dept (= area), machine, product type (null: not in Insights Hub), unique machine name (= asset id).',
    [linkInStep('MACHINES'), ...refEnd('pbi_machine_names', machineSchema)]);
  lane(r++, 'calendar ids',
    'keep the distinct calendar ids of the assets, then one message per calendar (one per second).',
    [
      linkInStep('CALENDAR IDS'),
      fn('pickFn', 'Pick ids', 'r3-pick-ids.js', ['next', 'LOG']),
      fn('targetsFn', 'Choose calendars', 'm4-calendar-targets.js', ['next']),
      split('calSplit'),
      delay('calDelay', 'One id per second'),
      end('SHIFT DETAIL')
    ]);
  lane(r++, 'pbi_shift_naming',
    'one message per calendar: GET the calendar events (window from the run day, calendarWindowDays of the Config tab) and build the shift rows, wait for all, collect, keep every name once, decide, write. Shift Naming EU: the event names of the calendars (this includes the Changeover events: the category filter is still open).',
    [
      linkInStep('SHIFT DETAIL'),
      fn('detailFn', 'Build calendar request', 'r4-detail-request.js',
        ['next'], {
          __BEFORE__: 'calendars/',
          __AFTER__: '/calendarEvents',
          __WINDOW__: 'true'
        }),
      http('detailHttp', 'GET calendar events'),
      fn('shiftRowsFn', 'Build shift rows', 'm5-shift-rows.js', ['next']),
      join('shiftJoin', 'Wait for all calendars'),
      fn('shiftCollect', 'Collect pbi_shift_naming', 'r5-collect.js',
        ['next']),
      fn('distinctFn', 'Keep distinct names', 'm5-distinct.js', ['next']),
      fn('shiftDecide', 'Decide pbi_shift_naming', 'r5-decide.js',
        ['next', 'LOG'], { __TABLE__: 'pbi_shift_naming' }),
      ...tableEnd('pbi_shift_naming', shiftSchema, 'r6-set-path.js')
    ]);
  lane(r++, 'WRITE pbi_calendar',
    'parquet node, path and write object for pbi_calendar (generated by 1.3: one row per date from the calendar range in 1.1, Monday week start, ISO week number). Dates are text YYYY-MM-DD.',
    [
      linkInStep('WRITE pbi_calendar'),
      ...tableEnd('pbi_calendar', calendarSchema, 'r6-set-path.js')
    ]);
  addLogLanes(b, r, 'pbi-reference');

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'Power BI reference',
    disabled: false, allowCycles: false,
    info: 'Writes the reference Power BI tables (pbi_machine_names, pbi_shift_naming, pbi_calendar) straight from the Insights Hub API. Read calls only. Needs the Config tab.'
  });
  return b.nodes;
}

// ---------- validation and output ----------
mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
const OUTPUTS = [
  ...SITES.map((site, index) => [
    `vfc-pbi-daily-${site.name.toLowerCase()}.json`,
    () => buildDailyFlow(site, index)
  ]),
  ['vfc-pbi-reference.json', buildReferenceFlow]
];
for (const [file, build] of OUTPUTS) {
  const nodes = build();
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
}
