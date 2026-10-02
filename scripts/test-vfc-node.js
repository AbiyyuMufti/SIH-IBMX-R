// Runs the generated "Process day" node code locally (same text as in the flow) with real read calls.
// Usage: node scripts/test-vfc-node.js 2026-09-30 [write]   (default is dry run; "write" only shows what would be sent)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import './lib-ih.js'; // loads .env into process.env

const day = process.argv[2] || '2026-09-30';
const write = process.argv[3] === 'write';
const cfgSrc = readFileSync(new URL('./vfc/node-config.js', import.meta.url), 'utf8');
const code = readFileSync(new URL('./vfc-transform.js', import.meta.url), 'utf8').replace(/\nif \(typeof module[\s\S]*$/, '\n')
  + readFileSync(new URL('./vfc/node-process-day-body.js', import.meta.url), 'utf8');
const ctx = {};
const flow = { get: (k) => ctx[k], set: (k, v) => { ctx[k] = v; } };
const quiet = { status: () => {} };
vm.runInNewContext('(function(flow,node,msg){' + cfgSrc + '})')(flow, quiet, {});
// local only: credentials from .env, in memory, never printed
ctx.cfg.clientId = process.env.RECKITT_API_TECHUSER_CLIENT_ID;
ctx.cfg.clientSecret = process.env.RECKITT_API_TECHUSER_CLIENT_SECRET;
ctx.cfg.dryRun = !write;
const sent = [];
const node = { status: (s) => console.log('status:', s.text), error: (e) => console.log('ERROR', e), send: (a) => sent.push(a) };
const fn = vm.runInNewContext('(function(flow,node,msg,fetch,Buffer,setTimeout,Promise){' + code + '})');
const ret = fn(flow, node, { payload: day, mode: 'backfill' }, fetch, Buffer, setTimeout, Promise);
console.log('return value (must be null):', ret);
for (let i = 0; i < 60 && !sent.length; i++) await new Promise((r) => setTimeout(r, 1000));
const [k, l, lg] = sent[0] || [];
console.log('LOG:', lg && lg.payload.slice(0, 700));
if (k) console.log('fact_kpi msg: path', k.path, 'rows', k.payload.length, 'columns', Object.keys(k.payload[0]).length, 'types', typeof k.payload[0].period_start, k.payload[0].production_day instanceof Date);
if (l) console.log('fact_loss msg: path', l.path, 'rows', l.payload.length, 'columns', Object.keys(l.payload[0]).length);
if (write && k && l) (await import('node:fs')).writeFileSync(new URL('../samples/vfc_rows.json', import.meta.url), JSON.stringify({ kpi: k.payload, loss: l.payload }));
