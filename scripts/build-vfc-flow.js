// Builds the importable VFC flow JSON -> flows/vfc-fact-kpi-fact-loss.json
// Usage: node scripts/build-vfc-flow.js
//
// The function-node code lives in scripts/vfc/*.js (one file per node).
// Edit those files, then run this script. Do not edit the JSON by hand.
// Function nodes in the VFC have NO fetch, require or process, so every API
// call is an http request node: a function sets msg.method/url/headers, the
// http request node (method "use") makes the call, the next function reads it.
// No loops: one message per day, one message per asset (split), and the
// results of the assets are collected by a join.
//
// Layout: one row per stage, left to right. A row starts with a link in and
// ends with a link out. Links are also used for everything that would
// otherwise run backward: the join input and the log.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import { validateFlow } from './validate-flow.js';

const code = (file) => readFileSync(new URL(`./vfc/${file}`, import.meta.url), 'utf8');

// ---------- parquet schemas ----------
// Types as saved by the VFC: UTF8 (shown as STRING in the editor), BOOLEAN,
// INT64, DOUBLE, TIMESTAMP_MILLIS. There is no DATE type: days are text.
const S = 'UTF8';
const B = 'BOOLEAN';
const I = 'INT64';
const D = 'DOUBLE';
const TS = 'TIMESTAMP_MILLIS';

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

// ---------- ids and layout ----------
let counter = 0;
const newId = () => {
  counter++;
  const a = (0x10000 + counter * 7919).toString(16).slice(-5);
  const b = (0xa0000 + counter * 104729).toString(16).slice(-6);
  return `${a}.${b}`;
};
const TAB = newId();
const nodes = [];

const COL_WIDTH = 190;
const FIRST_COL = 120;
const ROW_Y = [115, 330, 545, 760, 975, 1190, 1330, 1470];
const col = (c) => FIRST_COL + c * COL_WIDTH;
const row = (r) => ROW_Y[r - 1];

const add = (node) => {
  nodes.push({ z: TAB, ...node });
  return node.id;
};

const ids = {};
[
  'cfg', 'days', 'dayDelay',
  'tokenFn', 'tokenHttp', 'listFn', 'listHttp', 'chooseFn', 'split', 'assetDelay',
  'assetFn', 'assetHttp', 'kpiReqFn', 'kpiHttp', 'kpiCheckFn', 'pivotFn', 'kpiRowsFn',
  'stopsReqFn', 'stopsHttp', 'stopsCheckFn', 'stopRowsFn', 'resultFn',
  'join', 'collectFn', 'dayFieldsFn', 'decideFn', 'tablesFn',
  'kpiPq', 'kpiPath', 'kpiWrite', 'lossPq', 'lossPath', 'lossWrite', 'log'
].forEach((key) => {
  ids[key] = newId();
});

// ---------- node builders ----------
const fn = (key, name, file, outputs, c, r, wires, dy = 0) =>
  add({
    id: ids[key],
    type: 'function',
    name,
    func: code(file),
    outputs,
    language: 'javascript',
    noerr: 0,
    x: col(c),
    y: row(r) + dy,
    wires
  });

const http = (key, name, c, r, next) =>
  add({
    id: ids[key],
    type: 'http request',
    name,
    method: 'use',
    ret: 'obj',
    url: '',
    timeout: '',
    mindspherePath: '',
    useMindsphereAuth: false,
    isAdmin: false,
    x: col(c),
    y: row(r),
    wires: [[ids[next]]]
  });

const comment = (name, info, r) =>
  add({ id: newId(), type: 'comment', name, info, x: 140, y: row(r) - 65, wires: [] });

// Link nodes. One link in per key, any number of link outs per key.
const linkInIds = {};
const linkOutsOf = {};
const outsOf = (key) => {
  linkOutsOf[key] = linkOutsOf[key] || [];
  return linkOutsOf[key];
};
const linkIn = (key, name, c, r, next) => {
  linkInIds[key] = linkInIds[key] || newId();
  return add({
    id: linkInIds[key],
    type: 'link in',
    name,
    links: outsOf(key),
    x: col(c),
    y: row(r),
    wires: [[ids[next]]]
  });
};
const linkOut = (key, name, x, y) => {
  linkInIds[key] = linkInIds[key] || newId();
  const id = newId();
  outsOf(key).push(id);
  add({ id, type: 'link out', name, mode: 'link', links: [linkInIds[key]], x, y, wires: [] });
  return id;
};
// A link out at the end of a row, in the next column.
const rowEnd = (key, name, c, r) => linkOut(key, name, col(c), row(r));
// A link out for output 2 or 3 of a node: below and right of it.
const sideOut = (key, name, c, r, dx = 120, dy = 60) => linkOut(key, name, col(c) + dx, row(r) + dy);

// ---------- stage 1: triggers and config ----------
comment(
  '[1] TRIGGERS & CONFIG',
  'STAGE 1 - TRIGGERS AND CONFIG. Schedule: daily 07:00 UTC, builds yesterday and the days before it (rebuildDays in CONFIG). Backfill: edit the inject payload {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"} (production days, 06:00Z to 06:00Z) and click the button. Both go through 1.1 CONFIG, the only node to edit: output paths, dry-run switch, credentials, asset list, planned-stop roots. dryRun is true by default: set it to false to write files. 1.2 sends ONE MESSAGE PER DAY; the delay node starts one day every 5 s.',
  1
);
add({
  id: newId(), type: 'inject', name: 'Schedule 07:00 UTC', topic: '', payload: '', payloadType: 'date',
  repeat: '', repeatEnd: '0', endTime: '0', crontab: '0 7 * * *', offset: 'NaN', once: false, properties: '',
  timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false, powerMode: false,
  x: col(0), y: row(1) - 25, wires: [[ids.cfg]]
});
add({
  id: newId(), type: 'inject', name: 'Backfill (edit payload)', topic: '',
  payload: '{"start":"2026-09-01","end":"2026-09-03"}', payloadType: 'json',
  repeat: '', repeatEnd: '0', endTime: '0', crontab: '', offset: 'NaN', once: false, properties: '',
  timezone: 'utc', betweentimesunit: 'm', showNextExecution: false, powerMode: false,
  x: col(0), y: row(1) + 25, wires: [[ids.cfg]]
});
fn('cfg', '1.1 CONFIG (edit here)', 's1-config.js', 1, 1, 1, [[ids.days]]);
fn('days', '1.2 Build day list', 's1-build-days.js', 1, 2, 1, [[ids.dayDelay]]);
add({
  id: ids.dayDelay, type: 'delay', name: 'One day per 5 s', pauseType: 'rate', timeout: '5', timeoutUnits: 'seconds',
  rate: '1', nbRateUnits: '5', rateUnits: 'second', randomFirst: '1', randomLast: '5', randomUnits: 'seconds',
  drop: false, powerMode: false, x: col(3), y: row(1), wires: [[rowEnd('day', 'to DAY SETUP', 4, 1)]]
});

// ---------- stage 2: day setup ----------
comment(
  '[2] DAY SETUP',
  'STAGE 2 - DAY SETUP (one message per day). token request -> OEE asset list -> choose the assets. Function nodes cannot use fetch in the VFC, so every call is an http request node: the function before it sets msg.method, msg.url and msg.headers. A failure goes to the LOG and nothing is written for that day. The split node then sends one message per asset (one per second).',
  2
);
linkIn('day', 'DAY SETUP', 0, 2, 'tokenFn');
fn('tokenFn', '2.1 Build token request', 's2-token-request.js', 1, 1, 2, [[ids.tokenHttp]]);
http('tokenHttp', 'POST token', 2, 2, 'listFn');
fn('listFn', '2.2 Build asset list request', 's2-asset-list-request.js', 2, 3, 2, [
  [ids.listHttp],
  [sideOut('log', 'to LOG', 3, 2)]
]);
http('listHttp', 'GET OEE assets', 4, 2, 'chooseFn');
fn('chooseFn', '2.3 Choose assets', 's2-choose-assets.js', 2, 5, 2, [
  [ids.split],
  [sideOut('log', 'to LOG', 5, 2)]
]);
add({
  id: ids.split, type: 'split', name: 'Split per asset', splt: '\\n', spltType: 'str', arraySplt: 1,
  arraySpltType: 'len', stream: false, addname: 'assetIndex', x: col(6), y: row(2), wires: [[ids.assetDelay]]
});
add({
  id: ids.assetDelay, type: 'delay', name: 'One asset per second', pauseType: 'rate', timeout: '1',
  timeoutUnits: 'seconds', rate: '1', nbRateUnits: '1', rateUnits: 'second', randomFirst: '1', randomLast: '1',
  randomUnits: 'seconds', drop: false, powerMode: false, x: col(7), y: row(2),
  wires: [[rowEnd('asset', 'to ASSET KPIs', 8, 2)]]
});

// ---------- stage 3: one asset, KPIs ----------
comment(
  '[3] ASSET KPIs',
  'STAGE 3 - ONE ASSET, KPIs. 3.1 and 3.2: Asset Management GET asset (hierarchyPath), then evaluateKPIs POST (read-style, groupedByDateTime=true, recursive=false, no ORDER filter). 3.3 checks the response, 3.4 pivots it to one entry per hour, 3.5 builds the fact_kpi rows. Every asset ends at the join, also when skipped or failed (link "to JOIN"), so the join never waits for a missing message.',
  3
);
linkIn('asset', 'ASSET KPIs', 0, 3, 'assetFn');
fn('assetFn', '3.1 Build asset request', 's3-asset-request.js', 1, 1, 3, [[ids.assetHttp]]);
http('assetHttp', 'GET asset (hierarchy)', 2, 3, 'kpiReqFn');
fn('kpiReqFn', '3.2 Build KPI request', 's3-kpi-request.js', 2, 3, 3, [
  [ids.kpiHttp],
  [sideOut('join', 'to JOIN', 3, 3)]
]);
http('kpiHttp', 'POST evaluateKPIs', 4, 3, 'kpiCheckFn');
fn('kpiCheckFn', '3.3 Check KPI response', 's3-check-kpi.js', 2, 5, 3, [
  [ids.pivotFn],
  [sideOut('join', 'to JOIN', 5, 3)]
]);
fn('pivotFn', '3.4 Pivot KPI results', 's3-pivot-kpi.js', 1, 6, 3, [[ids.kpiRowsFn]]);
fn('kpiRowsFn', '3.5 Build KPI rows', 's3-kpi-rows.js', 1, 7, 3, [[rowEnd('stops', 'to ASSET STOPS', 8, 3)]]);

// ---------- stage 4: one asset, stops ----------
comment(
  '[4] ASSET STOPS',
  'STAGE 4 - ONE ASSET, STOPS. 4.1 downtimeReasons GET (size 5000, one page), 4.2 checks the response, 4.3 builds the fact_loss rows, 4.4 builds the result of the asset and sends it to the join.',
  4
);
linkIn('stops', 'ASSET STOPS', 0, 4, 'stopsReqFn');
fn('stopsReqFn', '4.1 Build stops request', 's4-stops-request.js', 1, 1, 4, [[ids.stopsHttp]]);
http('stopsHttp', 'GET downtimeReasons', 2, 4, 'stopsCheckFn');
fn('stopsCheckFn', '4.2 Check stops response', 's4-check-stops.js', 2, 3, 4, [
  [ids.stopRowsFn],
  [sideOut('join', 'to JOIN', 3, 4)]
]);
fn('stopRowsFn', '4.3 Build stop rows', 's4-stop-rows.js', 1, 4, 4, [[ids.resultFn]]);
fn('resultFn', '4.4 Build asset result', 's4-asset-result.js', 1, 5, 4, [[rowEnd('join', 'to JOIN', 6, 4)]]);

// ---------- stage 5: join and build tables ----------
comment(
  '[5] JOIN & BUILD TABLES',
  'STAGE 5 - JOIN AND BUILD. The join waits for all assets of the day. 5.1 collects the results, 5.2 adds production_day and local_date, 5.3 decides: it writes NOTHING if any asset failed (no half days) and nothing in dry-run mode, 5.4 builds one message per table. Output 1 of 5.4 = fact_kpi, output 2 = fact_loss, output 3 = log.',
  5
);
linkIn('join', 'JOIN', 0, 5, 'join');
add({
  id: ids.join, type: 'join', name: 'Wait for all assets of the day', mode: 'auto', build: 'array',
  property: 'payload', propertyType: 'msg', key: 'topic', joiner: '\\n', joinerType: 'str', accumulate: false,
  timeout: '', count: '', x: col(1), y: row(5), wires: [[ids.collectFn]]
});
fn('collectFn', '5.1 Collect results', 's5-collect.js', 1, 2, 5, [[ids.dayFieldsFn]]);
fn('dayFieldsFn', '5.2 Add day fields', 's5-day-fields.js', 1, 3, 5, [[ids.decideFn]]);
fn('decideFn', '5.3 Decide day', 's5-decide.js', 2, 4, 5, [
  [ids.tablesFn],
  [sideOut('log', 'to LOG', 4, 5)]
]);
fn('tablesFn', '5.4 Build table messages', 's5-table-messages.js', 3, 5, 5, [
  [linkOut('writeKpi', 'to WRITE fact_kpi', col(6) + 20, row(5) - 50)],
  [linkOut('writeLoss', 'to WRITE fact_loss', col(6) + 20, row(5))],
  [linkOut('log', 'to LOG', col(6) + 20, row(5) + 50)]
]);

// ---------- stages 6 and 7: write the two tables ----------
const parquet = (key, name, schema, c, r, next) =>
  add({
    id: ids[key], type: 'parquet', name, option: 'write',
    columns: schema.map(([column, type]) => ({ column, type })),
    rcolumns: '', multi: 'multiple', outputPty: 'payload', outputPtyType: 'msg', engine: 'parquetjs',
    x: col(c), y: row(r), wires: [[ids[next]]]
  });
const writeObject = (key, name, c, r) =>
  add({ id: ids[key], type: 'write object', name, path: '', mode: 'object', x: col(c), y: row(r), wires: [] });
const pathFn = (key, name, table, c, r, next) =>
  add({
    id: ids[key], type: 'function', name,
    func: code('s6-set-path.js').replaceAll('__TABLE__', table),
    outputs: 1, language: 'javascript', noerr: 0, x: col(c), y: row(r), wires: [[ids[next]]]
  });

comment(
  '[6] WRITE fact_kpi',
  'STAGE 6 - parquet node, path and write object for fact_kpi. The file name is the same on every rerun (path from CONFIG, YYYY-MM-DD = production day), so a rerun replaces the day. Types: UTF8 (STRING), BOOLEAN, INT64, DOUBLE, TIMESTAMP_MILLIS (epoch ms, set in 5.4); days are text YYYY-MM-DD.',
  6
);
linkIn('writeKpi', 'WRITE fact_kpi', 0, 6, 'kpiPq');
parquet('kpiPq', 'Write fact_kpi parquet', kpiSchema, 1, 6, 'kpiPath');
pathFn('kpiPath', '6.1 Set fact_kpi path', 'fact_kpi', 2, 6, 'kpiWrite');
writeObject('kpiWrite', 'fact_kpi to data lake', 3, 6);

comment('[7] WRITE fact_loss', 'STAGE 7 - parquet node, path and write object for fact_loss. Same pattern as stage 6.', 7);
linkIn('writeLoss', 'WRITE fact_loss', 0, 7, 'lossPq');
parquet('lossPq', 'Write fact_loss parquet', lossSchema, 1, 7, 'lossPath');
pathFn('lossPath', '7.1 Set fact_loss path', 'fact_loss', 2, 7, 'lossWrite');
writeObject('lossWrite', 'fact_loss to data lake', 3, 7);

// ---------- stage 8: log ----------
comment(
  '[8] LOG',
  'STAGE 8 - LOG. Every log line arrives here through the link "to LOG": one line per day (debug sidebar): rows per asset, sum of total time, skipped assets, KPI names without a column, FAILED / NOTHING WRITTEN, or the dry-run row counts and first rows.',
  8
);
linkIn('log', 'LOG', 0, 8, 'log');
add({
  id: ids.log, type: 'debug', name: 'Day log', active: true, tosidebar: true, console: false, tostatus: false,
  complete: 'payload', x: col(1), y: row(8), wires: []
});

// ---------- tab ----------
nodes.unshift({
  id: TAB,
  type: 'tab',
  label: 'Mufti OEE parquet (fact_kpi, fact_loss)',
  disabled: false,
  info: 'Writes two daily parquet tables to the data lake. Read calls only against Insights Hub.',
  allowCycles: false
});

// ---------- validation and output ----------
const { errors, warnings, stats } = validateFlow(nodes);
if (errors.length) {
  throw new Error(`flow check failed:\n  ${errors.join('\n  ')}`);
}
const json = JSON.stringify(nodes, null, 2);
if (!/PUT_CLIENT/.test(json)) {
  throw new Error('credential placeholders missing');
}
mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
writeFileSync(new URL('../flows/vfc-fact-kpi-fact-loss.json', import.meta.url), json + '\n');
console.log(
  `written flows/vfc-fact-kpi-fact-loss.json: ${stats.nodes} nodes, ${json.length} bytes, ` +
    `${stats.linkIn} link in / ${stats.linkOut} link out, longest function line ${stats.longestLine} characters`
);
warnings.forEach((w) => console.log(`warn: ${w}`));
