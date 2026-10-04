// Builds one importable VFC flow per site: flows/vfc-site-<name>.json.
// Each flow writes the two daily tables of that site to the data lake:
//   <root>/fact_kpi/<site>/fact_kpi_<day>.parquet
//   <root>/fact_loss/<site>/fact_loss_<day>.parquet
// Usage: node scripts/build-vfc-site-flows.js
//
// To add a site: add one entry to SITES below and run the script, or import
// an existing site file and change SITE_NAME in node 1.1 SITE SETTINGS (and
// the tab name). The site itself (asset ids, day start) lives in the Config
// tab, see scripts/vfc/c1-config.js.
// The function-node code lives in scripts/vfc/s*.js. Edit those files, then
// run this script. Do not edit the JSON by hand.
// Function nodes in the VFC have NO fetch, require or process, so every API
// call is an http request node. No loops: one message per day, one per asset
// (split), collected again by a join. Layout: one lane per row, left to
// right, on the 20 px editor grid.
import { writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import { validateFlow } from './validate-flow.js';
import {
  code, S, B, I, D, TS, makeBuilder, fn, http, linkInStep, end, split,
  delay, join, addLogLanes
} from './lib-flow-builder.js';

// One entry per site. cron = the daily schedule (UTC): one hour after the
// production day ends, so the day is complete.
const SITES = [
  { name: 'Hull', cron: '0 7 * * *' }
];

// ---------- parquet schemas ----------
// KPI_COLUMNS is defined in node 3.4. Read it from that file.
function tableFrom(source, name) {
  const match = source.match(new RegExp(`var ${name} = [\\s\\S]*?\\n[}\\]];`));
  return vm.runInNewContext(`${match[0]}\n${name};`);
}
const KPI_COLUMNS = tableFrom(code('s3-pivot-kpi.js'), 'KPI_COLUMNS');

// KPI columns that showed fractional values in real data (GT4 manual counts,
// B2 Line derived times). They are DOUBLE. The other KPI columns are INT64.
const DOUBLE_COLUMNS = [
  'good_parts',
  'total_parts',
  'rejected_parts',
  'connected_rejected_parts',
  'manual_rejected_parts',
  'theoretical_output',
  'used_operational_time_ms',
  'net_operational_time_ms',
  'performance_losses_ms',
  'quality_losses_ms',
  'mttr_ms',
  'mtbf_ms',
  'availability_loss_count',
  'downtime_count',
  'macro_stops_count'
];
const idColumns = [
  ['asset_id', S],
  ['asset_name', S],
  ['site', S],
  ['area', S],
  ['line', S],
  ['machine', S]
];
const kpiSchema = [
  ...idColumns,
  ['is_manual', B],
  ['product_unit', S],
  ['period_start', TS],
  ['period_end', TS],
  ['production_day', S],
  ['local_date', S],
  ['oee', D],
  ['teep', D],
  ['availability', D],
  ['performance', D],
  ['quality', D]
];
for (const column of Object.values(KPI_COLUMNS)) {
  if (!kpiSchema.find((x) => x[0] === column)) {
    kpiSchema.push([column, DOUBLE_COLUMNS.includes(column) ? D : I]);
  }
}
kpiSchema.push(['missing_mapping', S], ['load_mode', S], ['loaded_at', TS]);
const lossSchema = [
  ...idColumns,
  ['event_start', TS],
  ['event_end', TS],
  ['production_day', S],
  ['local_date', S],
  ['reason', S],
  ['reason_category', S],
  ['reason_subgroup', S],
  ['reason_full_path', S],
  ['loss_class', S],
  ['is_microstop', B],
  ['duration_ms', I],
  ['loss_time_ms', I],
  ['occurrence', D],
  ['comment_count', I],
  ['overwritten', B],
  ['load_mode', S],
  ['loaded_at', TS]
];

// Parquet, path and write object: the end of the two table lanes.
const tableEnd = (table, schema) => [
  { t: 'parquet', key: `${table}_pq`, table, schema },
  fn(`${table}_path`, `Set ${table} path`, 's6-set-path.js', ['next'],
    { __TABLE__: table }),
  { t: 'write', key: `${table}_write`, table }
];

function buildSiteFlow(site, index) {
  const b = makeBuilder(100 + index);
  const { add, id, col, rowY, comment, lane, linkOut } = b;
  let r = 1;

  // stage 1: triggers and site settings
  const stage1 = b.nextStage();
  comment(
    `[${stage1}] TRIGGERS & SITE SETTINGS`,
    `STAGE ${stage1} - TRIGGERS AND SITE SETTINGS. Site ${site.name}. Schedule: daily, builds yesterday and the days before it (REBUILD_DAYS in 1.1). Backfill: edit the inject payload {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"} (production days) and click the button. Both go through 1.1 SITE SETTINGS, the only node of this flow to edit: site name, dry-run switch, rebuild days. The shared settings (credentials, root folder, asset ids, production-day start) come from the Config tab through global context. dryRun is true by default: set it to false to write files. 1.2 sends ONE MESSAGE PER DAY; the delay node starts one day every 5 s.`,
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
    func: code('s1-site-settings.js').replace('__SITE__', site.name),
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
    'one asset. 3.1 and 3.2: Asset Management GET asset (hierarchyPath), then evaluateKPIs POST (read-style, groupedByDateTime=true, recursive=false, no ORDER filter). 3.3 checks the response, 3.4 pivots it to one entry per hour, 3.5 builds the fact_kpi rows. Every asset ends at the join, also when skipped or failed (link "to JOIN"), so the join never waits for a missing message.',
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
      fn('kpiRowsFn', 'Build KPI rows', 's3-kpi-rows.js', ['next']),
      end('STOPS')
    ]);
  lane(r++, 'ASSET STOPS',
    'one asset. 4.1 downtimeReasons GET (size 5000, one page), 4.2 checks the response, 4.3 builds the fact_loss rows, 4.4 builds the result of the asset and sends it to the join.',
    [
      linkInStep('STOPS'),
      fn('stopsReqFn', 'Build stops request', 's4-stops-request.js', ['next']),
      http('stopsHttp', 'GET downtimeReasons'),
      fn('stopsCheckFn', 'Check stops response', 's4-check-stops.js',
        ['next', 'JOIN']),
      fn('stopRowsFn', 'Build stop rows', 's4-stop-rows.js', ['next']),
      fn('resultFn', 'Build asset result', 's4-asset-result.js', ['next']),
      end('JOIN')
    ]);
  lane(r++, 'JOIN & BUILD TABLES',
    'the join waits for all assets of the day. 5.1 collects the results, 5.2 adds production_day and local_date, 5.3 decides: it writes NOTHING if any asset failed (no half days) and nothing in dry-run mode, 5.4 builds one message per table. Output 1 of 5.4 = fact_kpi, output 2 = fact_loss, output 3 = log.',
    [
      linkInStep('JOIN'),
      join('dayJoin', 'Wait for all assets of the day'),
      fn('collectFn', 'Collect results', 's5-collect.js', ['next']),
      fn('dayFieldsFn', 'Add day fields', 's5-day-fields.js', ['next']),
      fn('decideFn', 'Decide day', 's5-decide.js', ['next', 'LOG']),
      fn('tablesFn', 'Build table messages', 's5-table-messages.js',
        ['WRITE fact_kpi', 'WRITE fact_loss', 'LOG'], {}, true)
    ]);
  lane(r++, 'WRITE fact_kpi',
    'parquet node, path and write object for fact_kpi. The path is <root>/fact_kpi/<site>/fact_kpi_<production day>.parquet, the same on every rerun, so a rerun replaces the day. Types: UTF8 (STRING), BOOLEAN, INT64, DOUBLE, TIMESTAMP_MILLIS (epoch ms, set in 5.4); days are text YYYY-MM-DD.',
    [linkInStep('WRITE fact_kpi'), ...tableEnd('fact_kpi', kpiSchema)]);
  lane(r++, 'WRITE fact_loss',
    'parquet node, path and write object for fact_loss. Same pattern as the stage before.',
    [linkInStep('WRITE fact_loss'), ...tableEnd('fact_loss', lossSchema)]);
  // errors and the shared log
  addLogLanes(b, r, site.name.toLowerCase());

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: `${site.name} daily report`,
    disabled: false, allowCycles: false,
    info: `Writes the two daily parquet tables of site ${site.name} to the data lake. Read calls only against Insights Hub. Needs the Config tab.`
  });
  return b.nodes;
}

// ---------- validation and output ----------
mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
SITES.forEach((site, index) => {
  const file = `vfc-site-${site.name.toLowerCase()}.json`;
  const nodes = buildSiteFlow(site, index);
  const { errors, warnings, stats } = validateFlow(nodes);
  if (errors.length) {
    throw new Error(`flow check failed for ${file}:\n  ${errors.join('\n  ')}`);
  }
  const json = JSON.stringify(nodes, null, 2);
  writeFileSync(new URL(`../flows/${file}`, import.meta.url), json + '\n');
  console.log(
    `written flows/${file}: ${stats.nodes} nodes, ${stats.linkIn} link in / ` +
      `${stats.linkOut} link out, longest line ${stats.longestLine}`
  );
  warnings.forEach((w) => console.log(`warn: ${w}`));
});
