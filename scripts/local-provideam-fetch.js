// Runs the tab Provideam fetch on the laptop against the REAL Provideam API
// and keeps the source day files on disk (no data lake write).
// Reads: <root>/reference/provideam_reports/site=<Site>/<type>.json (body files,
// a download of eu_report/reference/). Writes: <root>/source/<type>/site=<Site>/
// <type>_<YYYY-MM-DD>.csv. Key: PROVIDEAM_API_KEY in .env (never printed).
// Calls are read-style POSTs on report bodies (approved). Then run
// scripts/local-report-build.js days=... root=<root> for the report tables.
// Usage: node scripts/local-provideam-fetch.js <root> start=YYYY-MM-DD end=YYYY-MM-DD
//   [sites=Hull,Nottingham,Weinheim]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runFlow } from './lib-vfc-runner.js';
import { loadEnv } from './lib-ih.js';

loadEnv();
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(name + '='));
  return hit ? hit.slice(name.length + 1) : fallback;
};
const root = resolve(process.argv[2] || '');
const start = arg('start');
const end = arg('end', start);
const sites = arg('sites', 'Hull,Nottingham,Weinheim').split(',');
const KEY = process.env.PROVIDEAM_API_KEY;
if (!process.argv[2] || !start || !KEY) {
  console.error('usage: <root> start=YYYY-MM-DD [end=..]; PROVIDEAM_API_KEY must be in .env');
  process.exit(2);
}

const read = (f) => JSON.parse(readFileSync(new URL('../flows/legacy_report_generator_v0/' + f, import.meta.url), 'utf8'));
const config = read('vfc-config.json').map((n) => n.type === 'function' ?
  { ...n, func: n.func.replace('PUT_PROVIDEAM_API_KEY_HERE', KEY) } : n);
const BODIES = 'eu_report/reference/provideam_reports';
const SOURCE = 'eu_report/pbi_report/source';

// The lake as the flow sees it: only the body files.
const lake = new Map();
for (const site of readdirSync(`${root}/reference/provideam_reports`)) {
  for (const f of readdirSync(`${root}/reference/provideam_reports/${site}`)) {
    lake.set(`${BODIES}/${site}/${f}`,
      readFileSync(`${root}/reference/provideam_reports/${site}/${f}`, 'utf8'));
  }
}

const stats = await runFlow(read('vfc-provideam-fetch.json'), {
  startDay: start,
  startPayload: { start, end, sites },
  write: true,
  configNodes: config,
  platform: 'xcelerator',
  lake,
  clientId: 'x',
  clientSecret: 'y',
  fetchImpl: (url, init) => fetch(url, init)
});

let files = 0;
for (const [path, text] of lake) {
  if (path.startsWith(SOURCE + '/')) {
    const target = `${root}/source/${path.slice(SOURCE.length + 1)}`;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    files++;
  }
}
console.log(`calls ${stats.requests.length}, source files ${files}, node errors ${stats.errors.length}`);
stats.errors.forEach((e) => console.log('  ERROR', String(e).slice(0, 200)));
stats.logs.filter((l) => typeof l === 'string' && /FAILED|NOTHING|rows|lost/i.test(l))
  .forEach((l) => console.log('  ', l.slice(0, 220)));
