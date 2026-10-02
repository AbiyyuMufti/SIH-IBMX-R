// Builds the importable VFC flow JSON -> flows/vfc-fact-kpi-fact-loss.json
// Function nodes in the VFC have NO fetch, require or process, so every API call is an http request node
// (pattern copied from source/Paul-Flow.json: function sets msg.method/url/headers -> http request "use" -> function).
// No loops: one message per day (Build day list), one message per asset (split), results collected by a join.
// Usage: node scripts/build-vfc-flow.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';

const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const transform = rd('./vfc-transform.js');
const sandbox = { module: { exports: {} } };
vm.runInNewContext(transform, sandbox);
const T = sandbox.module.exports;
const transformBody = transform.replace(/\nif \(typeof module[\s\S]*$/, '\n');

// ---------- parquet schemas (types as saved by the VFC: UTF8 (shown as STRING in the editor), BOOLEAN, INT64, DOUBLE, TIMESTAMP_MILLIS; no DATE, days are text YYYY-MM-DD) ----------
const S = 'UTF8', B = 'BOOLEAN', I = 'INT64', D = 'DOUBLE', TS = 'TIMESTAMP_MILLIS';
const idCols = [['asset_id', S], ['asset_name', S], ['site', S], ['area', S], ['line', S], ['machine', S]];
const kpiSchema = [...idCols, ['is_manual', B], ['product_unit', S], ['period_start', TS], ['period_end', TS], ['production_day', S], ['local_date', S],
  ['oee', D], ['teep', D], ['availability', D], ['performance', D], ['quality', D]];
for (const c of Object.values(T.KPI_COLUMNS)) if (!kpiSchema.find((x) => x[0] === c)) kpiSchema.push([c, T.DOUBLE_COLUMNS.includes(c) ? D : I]);
kpiSchema.push(['missing_mapping', S], ['load_mode', S], ['loaded_at', TS]);
const lossSchema = [...idCols, ['event_start', TS], ['event_end', TS], ['production_day', S], ['local_date', S], ['reason', S], ['reason_category', S],
  ['reason_subgroup', S], ['reason_full_path', S], ['loss_class', S], ['is_microstop', B], ['duration_ms', I], ['loss_time_ms', I], ['occurrence', D],
  ['comment_count', I], ['overwritten', B], ['load_mode', S], ['loaded_at', TS]];

// ---------- nodes ----------
let n = 0;
const id = () => (0x10000 + ++n * 7919).toString(16).slice(-5) + '.' + (0xa0000 + n * 104729).toString(16).slice(-6);
const TAB = id();
const nodes = [];
const add = (o) => { nodes.push({ z: TAB, ...o }); return o.id; };
const comment = (name, info, x, y) => add({ id: id(), type: 'comment', name, info, x, y, wires: [] });
const fnNode = (idv, name, func, outputs, x, y, wires) => add({ id: idv, type: 'function', name, func, outputs, language: 'javascript', noerr: 0, x, y, wires });
const http = (idv, name, x, y, next) => add({ id: idv, type: 'http request', name, method: 'use', ret: 'obj', url: '', timeout: '', mindspherePath: '', useMindsphereAuth: false, isAdmin: false, x, y, wires: [[next]] });

nodes.push({ id: TAB, type: 'tab', label: 'Mufti OEE parquet (fact_kpi, fact_loss)', disabled: false, info: 'Writes two daily parquet tables to the data lake. Read calls only against Insights Hub.', allowCycles: false });

comment('[1] CONFIG', 'GROUP 1 - CONFIG. The only place to edit: output paths, dry-run switch, credentials, asset list, rebuild days, planned-stop roots. The node runs on every trigger and stores the settings in flow context (flow.get("cfg")). dryRun is true by default: set it to false to write files.', 140, 40);
comment('[2] TRIGGERS', 'GROUP 2 - TRIGGERS. Schedule: daily 07:00 UTC, builds yesterday and the 2 production days before it. Backfill: edit the inject payload {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"} (production days, 06:00Z to 06:00Z) and click the button. Both go through CONFIG. "Build day list" then sends ONE MESSAGE PER DAY; the delay node starts one day every 5 s.', 140, 100);
comment('[3] DAY SETUP', 'GROUP 3 - ONE DAY, SETUP. token request -> OEE asset list -> choose the assets. Function nodes cannot use fetch in the VFC, so each call is an http request node (method, url and headers come from the function before it). Failures go to the LOG and nothing is written for that day.', 140, 160);
comment('[4] PER ASSET', 'GROUP 4 - ONE ASSET. The split node sends one message per asset (one per second). Calls per asset: Asset Management GET asset (hierarchyPath) -> evaluateKPIs POST (read-style, groupedByDateTime=true, recursive=false, no ORDER filter) -> downtimeReasons GET (size 5000, one page). Every asset ends at the join, also when skipped or failed, so the join never waits for a missing message.', 140, 220);
comment('[5] BUILD TABLES', 'GROUP 5 - JOIN + BUILD. The join waits for all assets of the day. "Build tables" writes NOTHING if any asset failed (no half days) and sends nothing in dry-run mode. Output 1 = fact_kpi, output 2 = fact_loss, output 3 = log.', 140, 280);
comment('[6] WRITE fact_kpi', 'GROUP 6 - parquet node + path + write object for fact_kpi. Same file name on every rerun (path from CONFIG, YYYY-MM-DD = production day), so a rerun replaces the day. Types: UTF8 (STRING), BOOLEAN, INT64, DOUBLE, TIMESTAMP_MILLIS (epoch ms, set in Build tables); days are text YYYY-MM-DD.', 140, 340);
comment('[7] WRITE fact_loss', 'GROUP 7 - parquet node + path + write object for fact_loss. Same pattern as group 6.', 140, 400);
comment('[8] LOG', 'GROUP 8 - LOG. One line per day (debug sidebar): rows per asset, sum of total time, skipped assets, KPI names without a column, FAILED / NOTHING WRITTEN, or the dry-run row counts and first rows.', 140, 460);

const I_ = {}; ['cfg', 'days', 'dayDelay', 'n1', 'httpTok', 'n2', 'httpOee', 'n3', 'split', 'assetDelay', 'n4', 'httpAm', 'n5', 'httpKpi', 'n6', 'httpLoss', 'n7', 'join', 'n8', 'kpiPq', 'kpiPath', 'kpiWrite', 'lossPq', 'lossPath', 'lossWrite', 'log'].forEach((k) => { I_[k] = id(); });

add({ id: id(), type: 'inject', name: 'Schedule 07:00 UTC', topic: '', payload: '', payloadType: 'date', repeat: '', repeatEnd: '0', endTime: '0', crontab: '0 7 * * *', offset: 'NaN', once: false, properties: '', timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false, powerMode: false, x: 150, y: 540, wires: [[I_.cfg]] });
add({ id: id(), type: 'inject', name: 'Backfill (edit payload)', topic: '', payload: '{"start":"2026-09-01","end":"2026-09-03"}', payloadType: 'json', repeat: '', repeatEnd: '0', endTime: '0', crontab: '', offset: 'NaN', once: false, properties: '', timezone: 'utc', betweentimesunit: 'm', showNextExecution: false, powerMode: false, x: 160, y: 600, wires: [[I_.cfg]] });
fnNode(I_.cfg, 'CONFIG (edit here)', rd('./vfc/node-config.js'), 1, 400, 570, [[I_.days]]);
fnNode(I_.days, 'Build day list', rd('./vfc/node-build-days.js'), 1, 620, 570, [[I_.dayDelay]]);
add({ id: I_.dayDelay, type: 'delay', name: 'One day per 5 s', pauseType: 'rate', timeout: '5', timeoutUnits: 'seconds', rate: '1', nbRateUnits: '5', rateUnits: 'second', randomFirst: '1', randomLast: '5', randomUnits: 'seconds', drop: false, powerMode: false, x: 830, y: 570, wires: [[I_.n1]] });

// day setup lane
fnNode(I_.n1, '1 Day: token request', rd('./vfc/n1-day-token.js'), 1, 160, 700, [[I_.httpTok]]);
http(I_.httpTok, 'POST token', 360, 700, I_.n2);
fnNode(I_.n2, '2 Day: OEE list request', rd('./vfc/n2-day-oee-list.js'), 2, 540, 700, [[I_.httpOee], [I_.log]]);
http(I_.httpOee, 'GET OEE assets', 760, 700, I_.n3);
fnNode(I_.n3, '3 Day: choose assets', rd('./vfc/n3-day-plan.js'), 2, 950, 700, [[I_.split], [I_.log]]);
add({ id: I_.split, type: 'split', name: 'Split per asset', splt: '\\n', spltType: 'str', arraySplt: 1, arraySpltType: 'len', stream: false, addname: 'assetIndex', x: 1140, y: 700, wires: [[I_.assetDelay]] });
add({ id: I_.assetDelay, type: 'delay', name: 'One asset per second', pauseType: 'rate', timeout: '1', timeoutUnits: 'seconds', rate: '1', nbRateUnits: '1', rateUnits: 'second', randomFirst: '1', randomLast: '1', randomUnits: 'seconds', drop: false, powerMode: false, x: 1330, y: 700, wires: [[I_.n4]] });

// per asset lane
fnNode(I_.n4, '4 Asset: details request', rd('./vfc/n4-asset-details.js'), 1, 160, 800, [[I_.httpAm]]);
http(I_.httpAm, 'GET asset (hierarchy)', 380, 800, I_.n5);
fnNode(I_.n5, '5 Asset: KPI request', transformBody + rd('./vfc/n5-asset-kpi-body.js'), 2, 580, 800, [[I_.httpKpi], [I_.join]]);
http(I_.httpKpi, 'POST evaluateKPIs', 790, 800, I_.n6);
fnNode(I_.n6, '6 Asset: loss request', transformBody + rd('./vfc/n6-asset-loss-body.js'), 2, 990, 800, [[I_.httpLoss], [I_.join]]);
http(I_.httpLoss, 'GET downtimeReasons', 1200, 800, I_.n7);
fnNode(I_.n7, '7 Asset: build result', transformBody + rd('./vfc/n7-asset-result-body.js'), 1, 1400, 800, [[I_.join]]);
add({ id: I_.join, type: 'join', name: 'Wait for all assets of the day', mode: 'auto', build: 'array', property: 'payload', propertyType: 'msg', key: 'topic', joiner: '\\n', joinerType: 'str', accumulate: false, timeout: '', count: '', x: 160, y: 900, wires: [[I_.n8]] });
fnNode(I_.n8, '8 Build tables', rd('./vfc/n8-build-tables.js'), 3, 400, 900, [[I_.kpiPq], [I_.lossPq], [I_.log]]);

const pq = (idv, name, schema, next, x, y) => add({ id: idv, type: 'parquet', name, option: 'write', columns: schema.map(([column, type]) => ({ column, type })), rcolumns: '', multi: 'multiple', outputPty: 'payload', outputPtyType: 'msg', engine: 'parquetjs', x, y, wires: [[next]] });
const pathFn = (idv, name, key, next, x, y) => fnNode(idv, name, `var cfg = flow.get('cfg');\nmsg.path = cfg.paths.${key}.replace('YYYY-MM-DD', msg.day);\nmsg.filename = msg.path.split('/').pop();\n// msg.payload (the parquet output) is passed through unchanged\nreturn msg;`, 1, x, y, [[next]]);
pq(I_.kpiPq, 'Write fact_kpi parquet', kpiSchema, I_.kpiPath, 650, 860);
pathFn(I_.kpiPath, 'Set fact_kpi path', 'fact_kpi', I_.kpiWrite, 860, 860);
add({ id: I_.kpiWrite, type: 'write object', name: 'fact_kpi to data lake', path: '', mode: 'object', x: 1060, y: 860, wires: [] });
pq(I_.lossPq, 'Write fact_loss parquet', lossSchema, I_.lossPath, 650, 930);
pathFn(I_.lossPath, 'Set fact_loss path', 'fact_loss', I_.lossWrite, 860, 930);
add({ id: I_.lossWrite, type: 'write object', name: 'fact_loss to data lake', path: '', mode: 'object', x: 1060, y: 930, wires: [] });
add({ id: I_.log, type: 'debug', name: 'Day log', active: true, tosidebar: true, console: false, tostatus: false, complete: 'payload', x: 650, y: 1000, wires: [] });

// ---------- validation ----------
const byId = new Map(nodes.map((x) => [x.id, x]));
if (byId.size !== nodes.length) throw new Error('duplicate node ids');
for (const x of nodes) for (const out of x.wires || []) for (const t of out) if (!byId.has(t)) throw new Error(`bad wire ${x.id} -> ${t}`);
for (const x of nodes.filter((q) => q.type === 'function')) { try { new Function('flow', 'node', 'msg', 'Buffer', x.func); } catch (e) { throw new Error(`syntax error in "${x.name}": ${e.message}`); } }
const forbidden = /\b(fetch|require|process|setTimeout|async|await)\b\s*[(.]?/;
for (const x of nodes.filter((q) => q.type === 'function')) {
  const code = x.func.replace(/\/\/.*$/gm, '');
  const m = code.match(/\b(fetch\s*\(|require\s*\(|process\.|setTimeout\s*\(|async\s+function|await\s)/);
  if (m) throw new Error(`"${x.name}" uses ${m[0]}, not available in the VFC function node`);
}
const state = new Map();
const visit = (k) => { if (state.get(k) === 1) throw new Error('cycle at ' + k); if (state.get(k) === 2) return; state.set(k, 1); for (const o of byId.get(k).wires || []) for (const t of o) visit(t); state.set(k, 2); };
nodes.forEach((x) => visit(x.id));
const json = JSON.stringify(nodes, null, 2);
if (!/PUT_CLIENT/.test(json)) throw new Error('credential placeholders missing');
mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
writeFileSync(new URL('../flows/vfc-fact-kpi-fact-loss.json', import.meta.url), json + '\n');
console.log('written flows/vfc-fact-kpi-fact-loss.json:', nodes.length, 'nodes,', json.length, 'bytes; no cycles; wires valid; function syntax OK; no fetch/require/process/setTimeout/async in function nodes');
