// Mini Node-RED runner: executes the EXPORTED flow JSON end to end with real read calls.
// Function nodes run in a sandbox WITHOUT fetch, require, process or setTimeout (as in the VFC).
// Messages are JSON-serialised between nodes (Dates become text), as the VFC does. http request nodes use fetch from here. split / join / delay / parquet / write object are simulated.
// Usage: node scripts/test-vfc-flow.js <startDay> [endDay] [write]
//   default = dry run. "write" = the node code takes the write path, but only the simulated parquet / write object nodes receive it (no file is written).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import './lib-ih.js'; // loads .env

const start = process.argv[2] || '2026-09-30';
const end = /^[0-9]{4}-/.test(process.argv[3] || '') ? process.argv[3] : start;
const write = process.argv.includes('write');
const nodes = JSON.parse(readFileSync(new URL('../flows/vfc-fact-kpi-fact-loss.json', import.meta.url), 'utf8'));
const byId = new Map(nodes.map((n) => [n.id, n]));
const ctx = {};
const flowCtx = { get: (k) => ctx[k], set: (k, v) => { ctx[k] = v; if (k === 'cfg') { v.clientId = process.env.RECKITT_API_TECHUSER_CLIENT_ID; v.clientSecret = process.env.RECKITT_API_TECHUSER_CLIENT_SECRET; v.dryRun = !write; if (process.argv.includes('all')) v.assetIds = []; } } };
const queue = [];
const stats = { http: 0, written: [], logs: [], parquetRows: {}, status: [] };
const joins = new Map();

function emit(n, outputs, msg) {
  (n.wires || []).forEach((targets, i) => {
    const out = outputs[i];
    const list = Array.isArray(out) ? out : out ? [out] : [];
    for (const m of list) for (const t of targets) queue.push([t, JSON.parse(JSON.stringify(m))]);
  });
}
const checkType = (t, v) => v === null || v === undefined || ((t === 'UTF8' || t === 'STRING') ? typeof v === 'string' : t === 'BOOLEAN' ? typeof v === 'boolean' : t === 'INT64' ? Number.isInteger(v) : t === 'DOUBLE' ? typeof v === 'number' : t === 'TIMESTAMP_MILLIS' ? Number.isInteger(v) : false);

async function run(id, msg) {
  const n = byId.get(id);
  if (n.type === 'function') {
    const sb = { flow: flowCtx, node: { status: (s) => stats.status.push(s.text), error: (e) => console.log('node.error', n.name, e), send: () => {}, warn: () => {} }, msg, Buffer, Promise };
    const fn = vm.runInNewContext('(function(flow,node,msg,Buffer,Promise){' + n.func + '\n})', {});
    const r = fn(sb.flow, sb.node, msg, Buffer, Promise);
    if (r === null || r === undefined) return;
    emit(n, n.outputs === 1 && !Array.isArray(r) ? [r] : n.outputs === 1 ? [r.length && Array.isArray(r[0]) ? r[0] : r] : r, msg);
  } else if (n.type === 'http request') {
    stats.http++;
    if (!msg.url || !msg.method) throw new Error('http request without msg.url/method');
    const body = msg.method !== 'GET' && msg.payload !== undefined ? (typeof msg.payload === 'object' ? JSON.stringify(msg.payload) : String(msg.payload)) : undefined;
    const res = await fetch(msg.url, { method: msg.method, headers: msg.headers, body });
    const t = await res.text();
    try { msg.payload = JSON.parse(t); } catch { msg.payload = t; }
    msg.statusCode = res.status;
    emit(n, [msg], msg);
  } else if (n.type === 'delay' || n.type === 'debug') {
    if (n.type === 'debug') { stats.logs.push(msg.payload); return; }
    emit(n, [msg], msg);
  } else if (n.type === 'split') {
    const arr = msg.payload, gid = Math.random().toString(36).slice(2);
    arr.forEach((el, i) => emit(n, [{ ...msg, payload: el, parts: { id: gid, index: i, count: arr.length, type: 'array' } }], msg));
  } else if (n.type === 'join') {
    const g = joins.get(msg.parts.id) || { items: [], count: msg.parts.count };
    g.items[msg.parts.index] = msg.payload; g.last = msg;
    joins.set(msg.parts.id, g);
    if (g.items.filter((x) => x !== undefined).length === g.count) { const out = { ...g.last, payload: g.items }; delete out.parts; emit(n, [out], out); }
  } else if (n.type === 'parquet') {
    const rows = msg.payload;
    const cols = new Map(n.columns.map((c) => [c.column, c.type]));
    for (const row of rows) {
      for (const k of Object.keys(row)) if (!cols.has(k)) throw new Error(`${n.name}: row has column ${k} that the parquet node does not define`);
      for (const [c, t] of cols) if (!checkType(t, row[c])) throw new Error(`${n.name}: column ${c} (${t}) got ${JSON.stringify(row[c])}`);
    }
    stats.parquetRows[n.name] = (stats.parquetRows[n.name] || 0) + rows.length;
    emit(n, [msg], msg); // assumption: the parquet node passes the message on with its other properties
  } else if (n.type === 'write object') {
    stats.written.push(msg.path);
  }
}

const cfgNode = nodes.find((n) => n.name === 'CONFIG (edit here)');
queue.push([cfgNode.id, { payload: { start, end } }]);
let guard = 0;
while (queue.length && guard++ < 5000) { const [id, m] = queue.shift(); await run(id, m); }
console.log('mode:', write ? 'write path (simulated)' : 'dry run', '| http calls:', stats.http, '| days', start, '..', end);
for (const l of stats.logs) console.log('LOG:', String(l).slice(0, 600));
console.log('parquet rows validated against column types:', JSON.stringify(stats.parquetRows));
console.log('write object paths:', JSON.stringify(stats.written));
