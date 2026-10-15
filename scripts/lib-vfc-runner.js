// Mini Node-RED runner for the exported VFC flow JSON (used by the tests).
// Function nodes run in a sandbox WITHOUT fetch, require, process or
// setTimeout (as in the VFC). Messages are JSON-serialised between nodes
// (Dates become text), as the VFC does. http request nodes call fetchImpl.
// split, join (auto and custom), delay, link in/out, parquet, catch and
// read/write object (an in-memory data lake) are simulated.
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

// Parses CSV text like the Node-RED csv node with "first row = names":
// quoted fields, "" inside quotes, any line end. Values stay text.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const flush = () => {
    row.push(field);
    field = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      flush();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') {
        i++;
      }
      flush();
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    flush();
    rows.push(row);
  }
  const names = rows.shift() || [];
  return rows
    .filter((r) => !(r.length === 1 && r[0] === ''))
    .map((r) => Object.fromEntries(
      names.map((n, i) => [n, r[i] === undefined ? '' : r[i]])
    ));
}

// The platform of a test run: argument platform=legacy|xcelerator or the
// environment variable TEST_PLATFORM. No default, as in the Config node.
export function testPlatform() {
  const arg = process.argv.find((a) => a.startsWith('platform='));
  const value = arg ? arg.slice(9) : process.env.TEST_PLATFORM;
  if (value !== 'legacy' && value !== 'xcelerator') {
    console.error('Give platform=legacy or platform=xcelerator (or TEST_PLATFORM)');
    process.exit(2);
  }
  return value;
}

// options: {startDay, endDay, write, allAssets, fetchImpl, clientId, clientSecret,
//           platform, xcTenantId, startPayload (payload of the first message,
//           default {start, end}), lakeTimes ({path: lastModified}, for the
//           list objects node),
//           configNodes}. configNodes = the Config tab: its CONFIG function is
//           run once first and stores the shared settings in global context.
export async function runFlow(nodes, options) {
  const { startDay, endDay = startDay, write = false, allAssets = false, fetchImpl } = options;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const context = {};
  const globalData = {};
  const globalContext = {
    get: (key) => globalData[key],
    set: (key, value) => {
      globalData[key] = value;
    }
  };
  const flowContext = {
    get: (key) => context[key],
    set: (key, value) => {
      context[key] = value;
      if (key === 'cfg') {
        value.clientId = options.clientId;
        value.clientSecret = options.clientSecret;
        if (value.dryRun && typeof value.dryRun === 'object') {
          for (const table of Object.keys(value.dryRun)) value.dryRun[table] = !write;
        } else {
          value.dryRun = !write;
        }
        if (allAssets) value.assetIds = [];
      }
    }
  };
  const queue = [];
  const joins = new Map();
  // In-memory data lake: path -> text. Pass options.lake to keep it between runs.
  const lake = options.lake || new Map();
  const customJoins = new Map();
  const waiting = [];
  const stats = {
    requests: [],
    logs: [],
    written: [],
    parquetRows: {},
    parquetPayloads: {},
    status: [],
    errors: [],
    warnings: [],
    lake
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
      const fn = vm.runInNewContext('(function(flow,node,msg,Buffer,Promise,glob){' + n.func + '\n})', {});
      const r = fn(flowContext, node, msg, Buffer, Promise, globalContext);
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
      const prop = n.complete && n.complete !== 'true' ? n.complete : 'payload';
      stats.logs.push(msg[prop]);
    } else if (n.type === 'catch') {
      emit(n, [msg]);
    } else if (n.type === 'read object') {
      if (!lake.has(msg.path)) {
        // The VFC read node only prints a warning and sends nothing on.
        stats.warnings.push(`${n.name}: file not found ${msg.path}`);
        return;
      }
      msg.payload = Buffer.from(lake.get(msg.path), 'utf8');
      emit(n, [msg]);
    } else if (n.type === 'csv') {
      // Header row = names, values stay text. multi "mult" = one message
      // with the array (the VFC node, tested by the user), "one" = per row.
      const text = Buffer.isBuffer(msg.payload)
        ? msg.payload.toString('utf8')
        : msg.payload && msg.payload.type === 'Buffer'
          ? Buffer.from(msg.payload.data).toString('utf8')
          : String(msg.payload);
      const rows = parseCsv(text);
      if (n.multi === 'one') {
        for (const row of rows) emit(n, [{ ...msg, payload: row }]);
      } else {
        emit(n, [{ ...msg, payload: rows }]);
      }
    } else if (n.type === 'list objects') {
      // Direct children of the folder msg.path: [{key, lastModified,
      // contentSize}].
      const folder = String(msg.path || '').replace(/^\//, '');
      const items = [];
      for (const [key, text] of lake) {
        const k = key.replace(/^\//, '');
        if (k.startsWith(folder) && !k.slice(folder.length).includes('/')) {
          items.push({
            key: k,
            lastModified: (options.lakeTimes || {})[k] || '2026-01-01T00:00:00.000Z',
            contentSize: String(text).length
          });
        }
      }
      msg.payload = items;
      emit(n, [msg]);
    } else if (n.type === 'delay' && n.pauseType === 'delay') {
      // A fixed delay sends when the rest of the flow is quiet.
      waiting.push([n, msg]);
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
    } else if (n.type === 'join' && n.mode === 'custom') {
      const g = customJoins.get(n.id) || { items: [] };
      g.items.push(msg.payload);
      g.last = msg;
      customJoins.set(n.id, g);
    } else if (n.type === 'join') {
      const joinKey = n.id + ':' + msg.parts.id;
      const g = joins.get(joinKey) || { items: [], count: msg.parts.count };
      g.items[msg.parts.index] = msg.payload;
      g.last = msg;
      joins.set(joinKey, g);
      if (g.items.filter((x) => x !== undefined).length === g.count) {
        const out = { ...g.last, payload: g.items };
        delete out.parts;
        emit(n, [out]);
      }
    } else if (n.type === 'parquet' && n.option === 'read') {
      // The test lake keeps tables as JSON text instead of parquet.
      const text = Buffer.isBuffer(msg.payload)
        ? msg.payload.toString('utf8')
        : msg.payload && msg.payload.type === 'Buffer'
          ? Buffer.from(msg.payload.data).toString('utf8')
          : String(msg.payload);
      // Default output of the VFC node: one message per row.
      const rows = JSON.parse(text);
      for (const row of rows) emit(n, [{ ...msg, payload: row }]);
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
      if (typeof msg.payload === 'string') lake.set(msg.path, msg.payload);
      // A parquet table in the test lake is kept as JSON text.
      if (Array.isArray(msg.payload)) {
        lake.set(msg.path, JSON.stringify(msg.payload));
      }
    }
  }

  if (options.configNodes) {
    const shared = options.configNodes.find((n) => n.type === 'function');
    const node = { status: () => {}, error: (e) => stats.errors.push(`CONFIG: ${e}`), send: () => {}, warn: () => {} };
    // The committed Config has no platform (no default). The test sets it
    // here; a Config from before the platform switch is run as it is.
    let configCode = shared.func;
    if (/platform: '/.test(configCode)) {
      if (!options.platform) {
        throw new Error('runFlow: options.platform (legacy or xcelerator) is required');
      }
      configCode = configCode.replace(/platform: '[^']*'/, `platform: '${options.platform}'`);
      configCode = configCode.replace(/xcTenantId: '[^']*'/, `xcTenantId: '${options.xcTenantId || '1234567890'}'`);
    }
    const fn = vm.runInNewContext('(function(flow,node,msg,Buffer,Promise,glob){' + configCode + '\n})', {});
    fn(flowContext, node, {}, Buffer, Promise, globalContext);
  }
  const config = nodes.find((n) => n.type === 'function' && /CONFIG|SETTINGS/.test(n.name));
  const first = options.startPayload || { start: startDay, end: endDay };
  queue.push([config.id, { payload: first }]);
  const catchNodes = nodes.filter((n) => n.type === 'catch');
  let guard = 0;
  for (;;) {
    if (!queue.length) {
      // A custom join sends its batch when its timeout runs out: here, when
      // the queue is empty.
      for (const [joinId, g] of [...customJoins]) {
        customJoins.delete(joinId);
        emit(byId.get(joinId), [{ ...g.last, payload: g.items }]);
      }
      while (waiting.length) {
        const [w, wm] = waiting.shift();
        emit(w, [wm]);
      }
      if (!queue.length) break;
    }
    if (guard++ > 20000) break;
    const [id, msg] = queue.shift();
    try {
      await run(id, msg);
    } catch (e) {
      const n = byId.get(id);
      if (catchNodes.length) {
        const m = { ...msg };
        m.error = { message: e.message, source: { id: n.id, name: n.name, type: n.type } };
        for (const c of catchNodes) queue.push([c.id, clone(m)]);
      } else {
        // the VFC logs the error and drops the message
        stats.errors.push(`${n.name}: ${e.message}`);
      }
    }
  }
  return stats;
}
