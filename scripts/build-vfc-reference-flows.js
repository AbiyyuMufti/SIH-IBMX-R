// Builds the five importable VFC flows for the reference tables
// -> flows/vfc-ref-<table>.json
// Usage: node scripts/build-vfc-reference-flows.js
//
// One flow file per table: dim_asset, dim_reason, dim_product, dim_shift,
// ref_target_seed. The function-node code lives in scripts/vfc/r*.js. Edit
// those files, then run this script. Do not edit the JSON by hand.
// Function nodes in the VFC have NO fetch, require or process, so every API
// call is an http request node. No loops: one message per asset or id (split),
// collected again by a join. Layout: one lane per row, left to right.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';

const code = (file) => readFileSync(new URL(`./vfc/${file}`, import.meta.url), 'utf8');

// Types as saved by the VFC: UTF8 (shown as STRING), BOOLEAN, INT64, DOUBLE,
// TIMESTAMP_MILLIS. There is no DATE type.
const S = 'UTF8';
const B = 'BOOLEAN';
const I = 'INT64';
const D = 'DOUBLE';
const TS = 'TIMESTAMP_MILLIS';

const SCHEMAS = {
  dim_asset: [
    ['asset_id', S], ['asset_name', S], ['site', S], ['area', S], ['line', S],
    ['machine', S], ['is_manual', B], ['is_configured', B], ['calendar_id', S],
    ['product_collection_id', S], ['reason_tree_id', S], ['loaded_at', TS]
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
  ],
  ref_target_seed: [
    ['asset_id', S], ['asset_name', S], ['kpi', S], ['warning', D],
    ['error', D], ['is_set', B], ['loaded_at', TS]
  ]
};

// ---------- steps ----------
// A step is one node in a lane. outs lists where each output goes: 'next'
// = the next node in the lane, any other word = a link out "to <WORD>".
const fn = (key, name, file, outs, replace = {}) => ({ t: 'fn', key, name, file, outs, replace });
const http = (key, name) => ({ t: 'http', key, name });
const linkInStep = (key) => ({ t: 'linkin', key });
const split = (key) => ({ t: 'split', key });
const delay = (key, name, seconds) => ({ t: 'delay', key, name, seconds });
const join = (key, name) => ({ t: 'join', key, name });

const SETUP_STEPS = (keep) => [
  linkInStep('SETUP'),
  fn('tokenFn', 'Build token request', 's2-token-request.js', ['next']),
  http('tokenHttp', 'POST token'),
  fn('listFn', 'Build asset list request', 's2-asset-list-request.js', ['next', 'LOG']),
  http('listHttp', 'GET OEE assets'),
  fn('chooseFn', 'Choose assets', 'r2-choose-assets.js', ['next', 'LOG'], {
    __KEEP__: String(keep)
  })
];
const SPLIT_ASSETS = (end) => [
  split('split'),
  delay('assetDelay', 'One asset per second', 1),
  { t: 'end', key: end }
];

// Pick ids, read the master list, split per id (stage with the list call).
const IDS_STEPS = (field, listPath, listKey, extraField) => [
  fn('pickFn', 'Pick ids', 'r3-pick-ids.js', ['next', 'LOG'], { __FIELD__: field }),
  fn('listReqFn', 'Build master list request', 'r3-list-request.js', ['next'], {
    __LIST_PATH__: listPath
  }),
  http('masterHttp', 'GET master list'),
  fn('chooseIdsFn', 'Choose ids', 'r3-choose-ids.js', ['next', 'LOG'], {
    __LIST_KEY__: listKey,
    __EXTRA_FIELD__: extraField
  }),
  split('idSplit'),
  delay('idDelay', 'One id per second', 1),
  { t: 'end', key: 'DETAIL' }
];

const DETAIL_LANE = (before, after, withWindow, rowsFile) => [
  linkInStep('DETAIL'),
  fn('detailFn', 'Build detail request', 'r4-detail-request.js', ['next'], {
    __BEFORE__: before,
    __AFTER__: after,
    __WINDOW__: String(withWindow)
  }),
  http('detailHttp', 'GET details'),
  fn('rowsFn', 'Build rows', rowsFile, ['next']),
  { t: 'end', key: 'JOIN' }
];

const CONFIG_IDS_LANES = (field) => [
  {
    title: 'ASSET CONFIG',
    info:
      'One message per asset. GET the OEE config of the asset and read one id from it. The result goes to the join of this stage ("to JOIN IDS"). A failed call is carried to the log, nothing is written.',
    steps: [
      linkInStep('CONFIG'),
      fn('cfgReqFn', 'Build config request', 'r3-config-request.js', ['next']),
      http('cfgHttp', 'GET asset config'),
      fn('cfgIdsFn', 'Read config id', 'r3-config-ids.js', ['next'], { __FIELD__: field }),
      { t: 'end', key: 'JOIN IDS' }
    ]
  },
  {
    title: 'COLLECT IDS',
    info:
      'Waits for all assets, then keeps the distinct ids. The master list gives the names. One message per id goes on to the detail calls.',
    steps: [
      linkInStep('JOIN IDS'),
      join('idsJoin', 'Wait for all assets'),
      ...IDS_STEPS('value', '__LIST_PATH__', '__LIST_KEY__', '__EXTRA_FIELD__')
    ]
  }
];

// ---------- the five flows ----------
const FLOWS = {
  dim_asset: {
    label: 'Mufti OEE reference: dim_asset',
    keep: true,
    extra: '',
    setupEnd: 'ASSET',
    lanes: [
      {
        title: 'ASSET',
        info:
          'One message per asset. Asset Management GET asset (hierarchyPath), then the OEE config of the asset (calendar and product collection ids). Unconfigured assets are kept: they get a row with empty ids. Every asset ends at the join, also when failed or excluded ("to JOIN").',
        steps: [
          linkInStep('ASSET'),
          fn('assetFn', 'Build asset request', 's3-asset-request.js', ['next']),
          http('assetHttp', 'GET asset (hierarchy)'),
          fn('cfgReqFn', 'Build config request', 'r3-asset-config-request.js', ['next', 'JOIN']),
          http('cfgHttp', 'GET asset config'),
          fn('rowFn', 'Build asset row', 'r3-asset-row.js', ['next']),
          { t: 'end', key: 'JOIN' }
        ]
      }
    ]
  },
  ref_target_seed: {
    label: 'Mufti OEE reference: ref_target_seed',
    keep: false,
    extra: '',
    setupEnd: 'ASSET',
    lanes: [
      {
        title: 'ASSET TARGETS',
        info:
          'One message per asset. GET the OEE asset (thresholds: warning and error per KPI), then one row per KPI. These are the KPI targets set in Insights Hub (0 = not set). Loss and category targets are not in the API.',
        steps: [
          linkInStep('ASSET'),
          fn('thrReqFn', 'Build thresholds request', 'r3-thresholds-request.js', ['next']),
          http('thrHttp', 'GET asset thresholds'),
          fn('rowFn', 'Build target rows', 'r3-target-rows.js', ['next']),
          { t: 'end', key: 'JOIN' }
        ]
      }
    ]
  },
  dim_reason: {
    label: 'Mufti OEE reference: dim_reason',
    keep: false,
    extra: '',
    setupEnd: 'TREES',
    lanes: [
      {
        title: 'REASON TREES',
        info:
          'The reason tree id of every asset comes with the OEE asset list. Keep the distinct ids, read the list of trees for the names, then one message per tree.',
        steps: [
          linkInStep('TREES'),
          ...IDS_STEPS('reasonTreeId', 'reasontrees', 'reasonTrees', '')
        ]
      },
      {
        title: 'REASONS',
        info:
          'One message per tree. GET the flat reason list (parentId) and build level, top level name and full path. The result goes to the join ("to JOIN").',
        steps: DETAIL_LANE('reasontrees/', '/reasons', false, 'r4-reason-rows.js')
      }
    ]
  },
  dim_product: {
    label: 'Mufti OEE reference: dim_product',
    keep: false,
    extra: '',
    setupEnd: 'CONFIG',
    lanes: [
      ...CONFIG_IDS_LANES('productCollectionId'),
      {
        title: 'PRODUCTS',
        info:
          'One message per product collection. GET the products (code, name, design speed) and convert the speed to units per hour. The result goes to the join ("to JOIN").',
        steps: DETAIL_LANE('productCollections/', '/products', false, 'r4-product-rows.js')
      }
    ],
    listPath: 'productCollections',
    listKey: 'productCollections',
    extraField: ''
  },
  dim_shift: {
    label: 'Mufti OEE reference: dim_shift',
    keep: false,
    extra:
      '  // Only dim_shift: calendar events are read for this many days.\n' +
      '  calendarWindowDays: 31,',
    setupEnd: 'CONFIG',
    lanes: [
      ...CONFIG_IDS_LANES('calendarId'),
      {
        title: 'SHIFTS',
        info:
          'One message per calendar. GET the calendar events (shift name, duration, recurrence) for the window set in CONFIG. The result goes to the join ("to JOIN").',
        steps: DETAIL_LANE('calendars/', '/calendarEvents', true, 'r4-shift-rows.js')
      }
    ],
    listPath: 'calendars',
    listKey: '',
    extraField: 'timeZoneText'
  }
};

// ---------- one flow ----------
const COL_WIDTH = 190;
const FIRST_COL = 120;
const ROW_STEP = 215;
const FIRST_ROW = 115;

function buildFlow(table, spec, flowIndex) {
  let counter = flowIndex * 1000;
  const newId = () => {
    counter++;
    const a = (0x10000 + counter * 7919).toString(16).slice(-5);
    const b = (0xa0000 + counter * 104729).toString(16).slice(-6);
    return `${a}.${b}`;
  };
  const TAB = newId();
  const nodes = [];
  const add = (node) => nodes.push({ z: TAB, ...node });
  const ids = {};
  const id = (key) => {
    ids[key] = ids[key] || newId();
    return ids[key];
  };
  const col = (c) => FIRST_COL + c * COL_WIDTH;
  const rowY = (r) => FIRST_ROW + (r - 1) * ROW_STEP;

  // Link nodes: one link in per key, any number of link outs per key.
  const linkInIds = {};
  const linkOutsOf = {};
  const linkOut = (key, x, y) => {
    linkInIds[key] = linkInIds[key] || newId();
    linkOutsOf[key] = linkOutsOf[key] || [];
    const outId = newId();
    linkOutsOf[key].push(outId);
    add({ id: outId, type: 'link out', name: `to ${key}`, mode: 'link', links: [linkInIds[key]], x, y, wires: [] });
    return outId;
  };
  const linkIn = (key, c, r, next) => {
    linkInIds[key] = linkInIds[key] || newId();
    linkOutsOf[key] = linkOutsOf[key] || [];
    add({
      id: linkInIds[key], type: 'link in', name: key, links: linkOutsOf[key],
      x: col(c), y: rowY(r), wires: [[next]]
    });
  };

  const comment = (name, info, r) =>
    add({ id: newId(), type: 'comment', name, info, x: 140, y: rowY(r) - 65, wires: [] });

  // Places the steps of one lane. fnNo numbers the function nodes of a stage.
  let stageNo = 0;
  function lane(r, title, info, steps, startCol = 0) {
    stageNo++;
    comment(`[${stageNo}] ${title}`, `STAGE ${stageNo} - ${info}`, r);
    let fnNo = 0;
    steps.forEach((step, i) => {
      const c = startCol + i;
      const nextStep = steps[i + 1];
      let nextId = null;
      if (nextStep && nextStep.t === 'end') {
        nextId = linkOut(nextStep.key, col(c + 1), rowY(r));
      } else if (nextStep) {
        nextId = id(nextStep.key);
      }
      const wiresFor = (outs) =>
        outs.map((o, k) => {
          if (o === 'next') return [nextId];
          return [linkOut(o, col(c) + 120, rowY(r) + 60 + (k - 1) * 40)];
        });
      const pos = { x: col(c), y: rowY(r) };
      if (step.t === 'linkin') {
        linkIn(step.key, c, r, nextId);
      } else if (step.t === 'fn') {
        fnNo++;
        let func = code(step.file);
        for (const [from, to] of Object.entries(step.replace)) {
          func = func.replaceAll(from, to);
        }
        add({
          id: id(step.key), type: 'function', name: `${stageNo}.${fnNo} ${step.name}`,
          func, outputs: step.outs.length, language: 'javascript', noerr: 0, ...pos,
          wires: wiresFor(step.outs)
        });
      } else if (step.t === 'http') {
        add({
          id: id(step.key), type: 'http request', name: step.name, method: 'use', ret: 'obj',
          url: '', timeout: '', mindspherePath: '', useMindsphereAuth: false, isAdmin: false,
          ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'split') {
        add({
          id: id(step.key), type: 'split', name: 'Split per item', splt: '\\n', spltType: 'str',
          arraySplt: 1, arraySpltType: 'len', stream: false, addname: 'index', ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'delay') {
        add({
          id: id(step.key), type: 'delay', name: step.name, pauseType: 'rate',
          timeout: String(step.seconds), timeoutUnits: 'seconds', rate: '1',
          nbRateUnits: String(step.seconds), rateUnits: 'second', randomFirst: '1', randomLast: '1',
          randomUnits: 'seconds', drop: false, powerMode: false, ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'join') {
        add({
          id: id(step.key), type: 'join', name: step.name, mode: 'auto', build: 'array',
          property: 'payload', propertyType: 'msg', key: 'topic', joiner: '\\n', joinerType: 'str',
          accumulate: false, timeout: '', count: '', ...pos, wires: [[nextId]]
        });
      }
    });
  }

  // ----- stage 1: triggers and config -----
  const first = (key) => id(key);
  let lanesRow = 1;
  stageNo++;
  comment(
    '[1] TRIGGER & CONFIG',
    `STAGE 1 - TRIGGER AND CONFIG. Writes the table ${table} to the data lake. Schedule: weekly, Monday 07:00 UTC. The Run now button starts it by hand. Both go through 1.1 CONFIG, the only node to edit: output path, dry-run switch, credentials, asset list. dryRun is true by default: set it to false to write the file. The file name is fixed, so every run replaces the file.`,
    1
  );
  add({
    id: newId(), type: 'inject', name: 'Weekly Mon 07:00 UTC', topic: '', payload: '', payloadType: 'date',
    repeat: '', repeatEnd: '0', endTime: '0', crontab: '0 7 * * 1', offset: 'NaN', once: false,
    properties: '', timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false, powerMode: false,
    x: col(0), y: rowY(1) - 25, wires: [[first('cfg')]]
  });
  add({
    id: newId(), type: 'inject', name: 'Run now', topic: '', payload: '', payloadType: 'date',
    repeat: '', repeatEnd: '0', endTime: '0', crontab: '', offset: 'NaN', once: false,
    properties: '', timezone: 'utc', betweentimesunit: 'm', showNextExecution: false, powerMode: false,
    x: col(0), y: rowY(1) + 25, wires: [[first('cfg')]]
  });
  const configCode = code('r1-config.js').replaceAll('__TABLE__', table).replace('__EXTRA__', spec.extra);
  add({
    id: id('cfg'), type: 'function', name: '1.1 CONFIG (edit here)', func: configCode, outputs: 1,
    language: 'javascript', noerr: 0, x: col(1), y: rowY(1), wires: [[id('runFn')]]
  });
  add({
    id: id('runFn'), type: 'function', name: '1.2 Build run message', func: code('r1-run-message.js'),
    outputs: 1, language: 'javascript', noerr: 0, x: col(2), y: rowY(1),
    wires: [[linkOut('SETUP', col(3), rowY(1))]]
  });

  // ----- stage 2: setup -----
  const setup = SETUP_STEPS(spec.keep);
  const splitsHere = spec.setupEnd === 'ASSET' || spec.setupEnd === 'CONFIG';
  const setupSteps = splitsHere
    ? [...setup, ...SPLIT_ASSETS(spec.setupEnd)]
    : [...setup, { t: 'end', key: spec.setupEnd }];
  lane(
    2,
    'SETUP',
    'token request, OEE asset list, choose the assets. Function nodes cannot use fetch in the VFC, so every call is an http request node: the function before it sets msg.method, msg.url and msg.headers. A failure goes to the LOG and nothing is written.',
    setupSteps
  );

  // ----- middle stages -----
  let r = 3;
  for (const l of spec.lanes) {
    const steps = l.steps.map((s) => {
      if (s.t !== 'fn') return s;
      const replace = { ...s.replace };
      for (const [k, v] of Object.entries(replace)) {
        if (v === '__LIST_PATH__') replace[k] = spec.listPath;
        if (v === '__LIST_KEY__') replace[k] = spec.listKey;
        if (v === '__EXTRA_FIELD__') replace[k] = spec.extraField;
      }
      return { ...s, replace };
    });
    lane(r, l.title, l.info, steps);
    r++;
  }

  // ----- join, decide, write, log -----
  lane(
    r,
    'JOIN & DECIDE',
    'The join waits for all items. Collect puts the rows in one list. Decide writes NOTHING if any item failed (no half tables) and nothing in dry-run mode. Output 1 = the rows for the parquet node, output 2 = the log.',
    [
      linkInStep('JOIN'),
      join('join', 'Wait for all items'),
      fn('collectFn', 'Collect rows', 'r5-collect.js', ['next']),
      fn('decideFn', 'Decide write', 'r5-decide.js', ['WRITE', 'LOG'], { __TABLE__: table })
    ]
  );
  r++;
  stageNo++;
  comment(
    `[${stageNo}] WRITE ${table}`,
    `STAGE ${stageNo} - parquet node, path and write object for ${table}. The path comes from CONFIG. Types: UTF8 (STRING), BOOLEAN, INT64, DOUBLE, TIMESTAMP_MILLIS (epoch ms).`,
    r
  );
  linkIn('WRITE', 0, r, id('pq'));
  add({
    id: id('pq'), type: 'parquet', name: `Write ${table} parquet`, option: 'write',
    columns: SCHEMAS[table].map(([column, type]) => ({ column, type })), rcolumns: '',
    multi: 'multiple', outputPty: 'payload', outputPtyType: 'msg', engine: 'parquetjs',
    x: col(1), y: rowY(r), wires: [[id('path')]]
  });
  add({
    id: id('path'), type: 'function', name: `${stageNo}.1 Set path`, func: code('r6-set-path.js'),
    outputs: 1, language: 'javascript', noerr: 0, x: col(2), y: rowY(r), wires: [[id('write')]]
  });
  add({
    id: id('write'), type: 'write object', name: `${table} to data lake`, path: '', mode: 'object',
    x: col(3), y: rowY(r), wires: []
  });
  r++;
  stageNo++;
  comment(
    `[${stageNo}] LOG`,
    `STAGE ${stageNo} - LOG. Every log line arrives here through the link "to LOG": one line per run (debug sidebar): row count, skipped assets, FAILED / NOTHING WRITTEN, or the dry-run row count and first rows.`,
    r
  );
  linkIn('LOG', 0, r, id('log'));
  add({
    id: id('log'), type: 'debug', name: 'Run log', active: true, tosidebar: true, console: false,
    tostatus: false, complete: 'payload', x: col(1), y: rowY(r), wires: []
  });

  nodes.unshift({
    id: TAB, type: 'tab', label: spec.label, disabled: false, allowCycles: false,
    info: `Writes the reference table ${table} to the data lake. Read calls only against Insights Hub.`
  });
  return nodes;
}

// ---------- validation and output ----------
mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
let index = 0;
for (const [table, spec] of Object.entries(FLOWS)) {
  index++;
  const nodes = buildFlow(table, spec, index);
  const { errors, warnings, stats } = validateFlow(nodes);
  if (errors.length) {
    throw new Error(`flow check failed for ${table}:\n  ${errors.join('\n  ')}`);
  }
  const json = JSON.stringify(nodes, null, 2);
  if (!/PUT_CLIENT/.test(json)) {
    throw new Error('credential placeholders missing');
  }
  const file = `../flows/vfc-ref-${table}.json`;
  writeFileSync(new URL(file, import.meta.url), json + '\n');
  console.log(
    `written flows/vfc-ref-${table}.json: ${stats.nodes} nodes, ` +
      `${stats.linkIn} link in / ${stats.linkOut} link out, longest line ${stats.longestLine}`
  );
  warnings.forEach((w) => console.log(`warn: ${w}`));
}
