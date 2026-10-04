// Mini Node-RED runner for the exported VFC flow JSON (used by the tests).
// Function nodes run in a sandbox WITHOUT fetch, require, process or
// setTimeout (as in the VFC). Messages are JSON-serialised between nodes
// (Dates become text), as the VFC does. http request nodes call fetchImpl.
// split, join, delay, link in/out, parquet and write object are simulated.
import vm from 'node:vm';

const clone = (value) => JSON.parse(JSON.stringify(value));

const typeOk = (type, v) => {
  if (v === null || v === undefined) return true;
  if (type === 'UTF8' || type === 'STRING') return typeof v === 'string';
  if (type === 'BOOLEAN') return typeof v === 'boolean';
  if (type === 'INT64') return Number.isInteger(v);
  if (type === 'DOUBLE') return typeof v === 'number';
  if (type === 'TIMESTAMP_MILLIS') return Number.isInteger(v);
  return false;
};

// options: {startDay, endDay, write, allAssets, fetchImpl, clientId, clientSecret}
export async function runFlow(nodes, options) {
  const { startDay, endDay = startDay, write = false, allAssets = false, fetchImpl } = options;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const context = {};
  const flowContext = {
    get: (key) => context[key],
    set: (key, value) => {
      context[key] = value;
      if (key === 'cfg') {
        value.clientId = options.clientId;
        value.clientSecret = options.clientSecret;
        value.dryRun = !write;
        if (allAssets) value.assetIds = [];
      }
    }
  };
  const queue = [];
  const joins = new Map();
  const stats = {
    requests: [],
    logs: [],
    written: [],
    parquetRows: {},
    parquetPayloads: {},
    status: [],
    errors: []
  };

  function emit(node, outputs) {
    (node.wires || []).forEach((targets, i) => {
      const out = outputs[i];
      const list = Array.isArray(out) ? out : out ? [out] : [];
      for (const m of list) {
        for (const t of targets) queue.push([t, clone(m)]);
      }
    });
  }

  async function run(id, msg) {
    const n = byId.get(id);
    if (n.type === 'function') {
      const node = {
        status: (s) => stats.status.push(s.text),
        error: (e) => stats.errors.push(`${n.name}: node.error ${e}`),
        send: () => {},
        warn: () => {}
      };
      const fn = vm.runInNewContext('(function(flow,node,msg,Buffer,Promise){' + n.func + '\n})', {});
      const r = fn(flowContext, node, msg, Buffer, Promise);
      if (r === null || r === undefined) return;
      if (n.outputs !== 1) return emit(n, r);
      if (!Array.isArray(r)) return emit(n, [r]);
      emit(n, [r.length && Array.isArray(r[0]) ? r[0] : r]);
    } else if (n.type === 'http request') {
      if (!msg.url || !msg.method) throw new Error('http request without msg.url/method');
      const body =
        msg.method !== 'GET' && msg.payload !== undefined
          ? typeof msg.payload === 'object' ? JSON.stringify(msg.payload) : String(msg.payload)
          : undefined;
      stats.requests.push({ method: msg.method, url: msg.url, body: body || null });
      const res = await fetchImpl(msg.url, { method: msg.method, headers: msg.headers, body });
      const text = await res.text();
      try {
        msg.payload = JSON.parse(text);
      } catch {
        msg.payload = text;
      }
      msg.statusCode = res.status;
      emit(n, [msg]);
    } else if (n.type === 'debug') {
      stats.logs.push(msg.payload);
    } else if (n.type === 'delay' || n.type === 'link in') {
      emit(n, [msg]);
    } else if (n.type === 'link out') {
      for (const target of n.links) queue.push([target, clone(msg)]);
    } else if (n.type === 'split') {
      const groupId = Math.random().toString(36).slice(2);
      msg.payload.forEach((el, i) => {
        const part = { id: groupId, index: i, count: msg.payload.length, type: 'array' };
        emit(n, [{ ...msg, payload: el, parts: part }]);
      });
    } else if (n.type === 'join') {
      const g = joins.get(msg.parts.id) || { items: [], count: msg.parts.count };
      g.items[msg.parts.index] = msg.payload;
      g.last = msg;
      joins.set(msg.parts.id, g);
      if (g.items.filter((x) => x !== undefined).length === g.count) {
        const out = { ...g.last, payload: g.items };
        delete out.parts;
        emit(n, [out]);
      }
    } else if (n.type === 'parquet') {
      const columns = new Map(n.columns.map((c) => [c.column, c.type]));
      for (const row of msg.payload) {
        for (const key of Object.keys(row)) {
          if (!columns.has(key)) throw new Error(`${n.name}: row has column ${key} that the parquet node does not define`);
        }
        for (const [column, type] of columns) {
          if (!typeOk(type, row[column])) {
            throw new Error(`${n.name}: column ${column} (${type}) got ${JSON.stringify(row[column])}`);
          }
        }
      }
      stats.parquetRows[n.name] = (stats.parquetRows[n.name] || 0) + msg.payload.length;
      (stats.parquetPayloads[n.name] = stats.parquetPayloads[n.name] || []).push(msg.payload);
      // assumption: the parquet node passes the message on with its other properties
      emit(n, [msg]);
    } else if (n.type === 'write object') {
      stats.written.push(msg.path);
    }
  }

  const config = nodes.find((n) => n.type === 'function' && /CONFIG/.test(n.name));
  queue.push([config.id, { payload: { start: startDay, end: endDay } }]);
  let guard = 0;
  while (queue.length && guard++ < 20000) {
    const [id, msg] = queue.shift();
    try {
      await run(id, msg);
    } catch (e) {
      // the VFC logs the error and drops the message
      stats.errors.push(`${byId.get(id).name}: ${e.message}`);
    }
  }
  return stats;
}
