// Builds the importable VFC flows for the reference tables:
//   flows/vfc-config.json            the Config tab (shared settings)
//   flows/vfc-reference-tables.json  one tab, five tables
// Usage: node scripts/build-vfc-reference-flows.js
//
// The function-node code lives in scripts/vfc/c*.js and r*.js. Edit those
// files, then run this script. Do not edit the JSON by hand.
// Function nodes in the VFC have NO fetch, require or process, so every API
// call is an http request node. No loops: one message per asset or id (split),
// collected again by a join. Layout: one lane per row, left to right, on the
// 20 px editor grid.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  code, S, B, I, D, TS, makeBuilder, fn, http, linkInStep, end, split,
  delay, join, addLogLanes
} from './lib-flow-builder.js';

const SCHEMAS = {
  dim_asset: [
    ['asset_id', S], ['asset_name', S], ['site', S], ['area', S], ['line', S],
    ['machine', S], ['is_manual', B], ['is_configured', B], ['calendar_id', S],
    ['product_collection_id', S], ['reason_tree_id', S], ['loaded_at', TS]
  ],
  ref_target_seed: [
    ['asset_id', S], ['asset_name', S], ['kpi', S], ['warning', D],
    ['error', D], ['is_set', B], ['loaded_at', TS]
  ],
  dim_reason: [
    ['reason_tree_id', S], ['tree_name', S], ['reason_id', S], ['reason_name', S],
    ['parent_id', S], ['level', I], ['top_level_name', S], ['full_path', S],
    ['justification', B], ['loaded_at', TS]
  ],
  dim_product: [
    ['collection_id', S], ['collection_name', S], ['product_id', S], ['code', S],
    ['name', S], ['description', S], ['design_speed_value', D],
    ['design_speed_unit', S], ['design_speed_interval', S],
    ['design_speed_type', S], ['design_speed_per_hour', D], ['loaded_at', TS]
  ],
  dim_shift: [
    ['calendar_id', S], ['calendar_name', S], ['time_zone_text', S],
    ['event_id', S], ['shift_name', S], ['description', S],
    ['time_model_category_id', S], ['duration_ms', I], ['freq', S],
    ['interval', I], ['start_utc', TS], ['until_utc', TS], ['loaded_at', TS]
  ]
};
// The tables with a master list and one detail call per id.
const ID_TABLES = {
  dim_reason: {
    ids: 'REASON IDS', detail: 'REASON DETAIL', listPath: 'reasontrees',
    listKey: 'reasonTrees', extra: '', before: 'reasontrees/', after: '/reasons',
    window: false, rowsFile: 'r4-reason-rows.js', what: 'reason tree'
  },
  dim_product: {
    ids: 'PRODUCT IDS', detail: 'PRODUCT DETAIL', listPath: 'productCollections',
    listKey: 'productCollections', extra: '', before: 'productCollections/',
    after: '/products', window: false, rowsFile: 'r4-product-rows.js',
    what: 'product collection'
  },
  dim_shift: {
    ids: 'CALENDAR IDS', detail: 'CALENDAR DETAIL', listPath: 'calendars',
    listKey: '', extra: 'timeZoneText', before: 'calendars/',
    after: '/calendarEvents', window: true, rowsFile: 'r4-shift-rows.js',
    what: 'calendar'
  }
};
const ALL_TABLES = ['dim_asset', 'ref_target_seed', 'dim_reason', 'dim_product', 'dim_shift'];

// Collect, decide, parquet, path, write: the end of every table lane.
const tableEnd = (table) => [
  fn(`${table}_collect`, `Collect ${table}`, 'r5-collect.js', ['next']),
  fn(`${table}_decide`, `Decide ${table}`, 'r5-decide.js', ['next', 'LOG'], { __TABLE__: table }),
  { t: 'parquet', key: `${table}_pq`, table, schema: SCHEMAS[table] },
  fn(`${table}_path`, `Set ${table} path`, 'r6-set-path.js', ['next'], { __TABLE__: table }),
  { t: 'write', key: `${table}_write`, table }
];

// ---------- the reference flow ----------
function buildReferenceFlow() {
  const b = makeBuilder(1);
  const { add, id, col, rowY, comment, lane, linkOut } = b;
  let r = 1;

  // stage 1: triggers and task settings
  const stage1 = b.nextStage();
  comment(
    `[${stage1}] TRIGGER & TASK SETTINGS`,
    `STAGE ${stage1} - TRIGGER AND TASK SETTINGS. Writes five reference tables to the data lake. Schedule: weekly, Monday 07:00 UTC. The Run now button starts it by hand. Both go through 1.1 TASK SETTINGS: the dry-run switch per table. The shared settings (credentials, sites, asset ids, root folder) come from the Config tab through global context. dryRun is true by default. Every table file has a fixed name, so every run replaces it.`,
    r
  );
  const inject = (name, dy, crontab) => add({
    id: b.newId(), type: 'inject', name, topic: '', payload: '', payloadType: 'date',
    repeat: '', repeatEnd: '0', endTime: '0', crontab, offset: 'NaN', once: false,
    properties: '', timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false,
    powerMode: false, x: col(0), y: rowY(r) + dy, wires: [[id('settings')]]
  });
  inject('Weekly Mon 07:00 UTC', -40, '0 7 * * 1');
  inject('Run now', 40, '');
  const dryRun = ALL_TABLES.map((t, i) => `  ${t}: true${i < ALL_TABLES.length - 1 ? ',' : ''}`).join('\n');
  add({
    id: id('settings'), type: 'function', name: '1.1 TASK SETTINGS (edit here)',
    func: code('r1-settings.js').replace('__DRY_RUN__', dryRun), outputs: 1,
    language: 'javascript', noerr: 0, x: col(1), y: rowY(r), wires: [[id('runFn')]]
  });
  add({
    id: id('runFn'), type: 'function', name: '1.2 Build run message', func: code('r1-run-message.js'),
    outputs: 1, language: 'javascript', noerr: 0, x: col(2), y: rowY(r),
    wires: [[linkOut('SETUP', col(3), rowY(r))]]
  });
  r++;

  lane(r++, 'SETUP',
    'token request, OEE asset list, choose the assets, one message per asset. Function nodes cannot use fetch in the VFC, so every call is an http request node: the function before it sets msg.method, msg.url and msg.headers. A failure goes to the LOG and nothing is written.',
    [
      linkInStep('SETUP'),
      fn('tokenFn', 'Build token request', 's2-token-request.js', ['next']),
      http('tokenHttp', 'POST token'),
      fn('listFn', 'Build asset list request', 's2-asset-list-request.js', ['next', 'LOG']),
      http('listHttp', 'GET OEE assets'),
      fn('chooseFn', 'Choose assets', 'r2-choose-assets.js', ['next', 'LOG']),
      split('split'),
      delay('assetDelay', 'One asset per second'),
      end('ASSET')
    ]);
  lane(r++, 'ASSET',
    'one message per asset, three calls: Asset Management GET asset (hierarchyPath), OEE config (calendar and product collection ids), OEE thresholds (KPI targets). An excluded or unconfigured asset skips the OEE calls and goes straight to 4.1 ("to BUILD").',
    [
      linkInStep('ASSET'),
      fn('assetFn', 'Build asset request', 's3-asset-request.js', ['next']),
      http('assetHttp', 'GET asset (hierarchy)'),
      fn('cfgReqFn', 'Save hierarchy, ask config', 'r3-asset-config-request.js', ['next', 'BUILD']),
      http('cfgHttp', 'GET asset config'),
      fn('thrReqFn', 'Save config, ask targets', 'r3-thresholds-request.js', ['next']),
      http('thrHttp', 'GET asset thresholds'),
      end('BUILD')
    ]);
  lane(r++, 'BUNDLES & ROUTE',
    'one bundle per asset: the dim_asset item, the target item and the three id items (product collection, calendar, reason tree). The join waits for all assets. 4.4 sends one message per table: output 1 dim_asset, 2 ref_target_seed, 3 product collection ids, 4 calendar ids, 5 reason tree ids.',
    [
      linkInStep('BUILD'),
      fn('targetFn', 'Build target item', 'r3-target-rows.js', ['next']),
      fn('dimFn', 'Build asset item', 'r3-asset-row.js', ['next']),
      fn('idsFn', 'Build id items', 'r3-id-items.js', ['next']),
      join('bundleJoin', 'Wait for all assets'),
      fn('routeFn', 'Route to tables', 'r4-route-tables.js',
        ['DIM ASSET', 'TARGETS', 'PRODUCT IDS', 'CALENDAR IDS', 'REASON IDS'], {}, true)
    ]);

  // the two tables that come straight from the asset bundles
  lane(r++, 'dim_asset', 'collect the asset items, decide (nothing is written when an asset failed, nothing in dry-run mode), write the parquet file. Unconfigured assets are kept, with empty ids.',
    [linkInStep('DIM ASSET'), ...tableEnd('dim_asset')]);
  lane(r++, 'ref_target_seed', 'collect the target items (KPI warning and error values), decide, write. The assets that were skipped are listed in the log.',
    [linkInStep('TARGETS'), ...tableEnd('ref_target_seed')]);

  // the three tables with a master list and one call per id
  for (const [table, t] of Object.entries(ID_TABLES)) {
    lane(r++, `${table} ids`,
      `keep the distinct ${t.what} ids of the assets, read the master list for the names, then one message per id.`,
      [
        linkInStep(t.ids),
        fn(`${table}_pick`, 'Pick ids', 'r3-pick-ids.js', ['next', 'LOG']),
        fn(`${table}_listReq`, 'Build master list request', 'r3-list-request.js', ['next'], {
          __LIST_PATH__: t.listPath
        }),
        http(`${table}_listHttp`, 'GET master list'),
        fn(`${table}_chooseIds`, 'Choose ids', 'r3-choose-ids.js', ['next', 'LOG'], {
          __LIST_KEY__: t.listKey,
          __EXTRA_FIELD__: t.extra
        }),
        split(`${table}_split`),
        delay(`${table}_delay`, 'One id per second'),
        end(t.detail)
      ]);
    lane(r++, table,
      `one message per ${t.what}: GET the details and build the rows, wait for all, collect, decide, write.`,
      [
        linkInStep(t.detail),
        fn(`${table}_detail`, `Build ${t.what} request`, 'r4-detail-request.js', ['next'], {
          __BEFORE__: t.before,
          __AFTER__: t.after,
          __WINDOW__: String(t.window)
        }),
        http(`${table}_detailHttp`, 'GET details'),
        fn(`${table}_rows`, `Build ${table} rows`, t.rowsFile, ['next']),
        join(`${table}_join`, 'Wait for all ids'),
        ...tableEnd(table)
      ]);
  }

  // errors and the shared log
  addLogLanes(b, r, 'reference');

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'Reference tables', disabled: false, allowCycles: false,
    info: 'Writes five reference tables to the data lake: dim_asset, ref_target_seed, dim_reason, dim_product, dim_shift. Read calls only against Insights Hub. Needs the Config tab.'
  });
  return b.nodes;
}

// ---------- the config tab ----------
function buildConfigFlow() {
  const b = makeBuilder(20);
  b.comment(
    '[1] CONFIG',
    'STAGE 1 - CONFIG. The shared settings of ALL flows live in node 1.1 CONFIG, the only node to edit: root folder, credentials, sites with their asset ids and production-day start, exclusions. It stores them in global context (glob.get("cfg")). It runs on deploy and when you click Apply. After a change, click Apply, then run the flow you want to test.',
    1
  );
  const cfgId = b.id('cfg');
  const inject = (name, dy, once) => b.add({
    id: b.newId(), type: 'inject', name, topic: '', payload: '', payloadType: 'date',
    repeat: '', repeatEnd: '0', endTime: '0', crontab: '', offset: 'NaN', once,
    onceDelay: once ? 1 : 0.1, properties: '', timezone: 'UTC', betweentimesunit: 'm',
    showNextExecution: false, powerMode: false, x: b.col(0), y: b.rowY(1) + dy, wires: [[cfgId]]
  });
  inject('On deploy', -40, true);
  inject('Apply', 40, false);
  b.add({
    id: cfgId, type: 'function', name: '1.1 CONFIG (edit here)', func: code('c1-config.js'),
    outputs: 1, language: 'javascript', noerr: 0, x: b.col(1), y: b.rowY(1), wires: [[]]
  });
  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'Config', disabled: false, allowCycles: false,
    info: 'Shared settings of the flows, stored in global context.'
  });
  return b.nodes;
}

// ---------- validation and output ----------
mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
const OUTPUTS = [
  ['vfc-config.json', buildConfigFlow],
  ['vfc-reference-tables.json', buildReferenceFlow]
];
for (const [file, build] of OUTPUTS) {
  const nodes = build();
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
}
