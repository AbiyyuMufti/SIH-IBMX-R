// Runs the EXPORTED flow JSON end to end with the mini runner (lib-vfc-runner).
// Usage: node scripts/test-vfc-flow.js <startDay> [endDay] [write] [all] [mock[=scenario]]
//   default  = dry run with real read calls (credentials from .env)
//   write    = the node code takes the write path, but only the simulated
//              parquet / write object nodes receive it (no file is written)
//   all      = every configured OEE asset instead of the list in CONFIG
//   mock     = synthetic answers, no network and no .env (see lib-mock-ih.js)
//   file=<path>  run another flow file (default: the fact_kpi / fact_loss flow)
//                the Config tab flows/vfc-config.json runs first (global context)
import { readFileSync } from 'node:fs';
import { runFlow } from './lib-vfc-runner.js';
import { makeMockFetch } from './lib-mock-ih.js';

const args = process.argv.slice(2);
const start = args[0] || '2026-09-30';
const end = /^[0-9]{4}-/.test(args[1] || '') ? args[1] : start;
const write = args.includes('write');
const mockArg = args.find((a) => a === 'mock' || a.startsWith('mock='));
const fileArg = args.find((a) => a.startsWith('file='));
const flowFile = fileArg ? fileArg.slice(5) : 'flows/vfc-fact-kpi-fact-loss.json';
const nodes = JSON.parse(readFileSync(new URL('../' + flowFile, import.meta.url), 'utf8'));

const options = { startDay: start, endDay: end, write, allAssets: args.includes('all') };
// The Config tab (shared settings in global context) runs first when it exists.
try {
  options.configNodes = JSON.parse(readFileSync(new URL('../flows/vfc-config.json', import.meta.url), 'utf8'));
} catch (e) {
  options.configNodes = null;
}
if (mockArg) {
  options.fetchImpl = makeMockFetch(mockArg.split('=')[1] || 'ok');
  options.clientId = 'mock-id';
  options.clientSecret = 'mock-secret';
  options.allAssets = true;
} else {
  await import('./lib-ih.js'); // loads .env
  options.fetchImpl = fetch;
  options.clientId = process.env.RECKITT_API_TECHUSER_CLIENT_ID;
  options.clientSecret = process.env.RECKITT_API_TECHUSER_CLIENT_SECRET;
}

const stats = await runFlow(nodes, options);
const mode = write ? 'write path (simulated)' : 'dry run';
console.log('mode:', mode, mockArg ? `| ${mockArg}` : '', '| http calls:', stats.requests.length, '| days', start, '..', end);
for (const line of stats.logs) console.log('LOG:', String(line).slice(0, 600));
console.log('parquet rows validated against column types:', JSON.stringify(stats.parquetRows));
console.log('write object paths:', JSON.stringify(stats.written));
for (const e of stats.errors) console.log('ERROR:', e);
if (stats.errors.length) process.exitCode = 1;
