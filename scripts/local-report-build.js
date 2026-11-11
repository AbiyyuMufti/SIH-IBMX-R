// Runs the two PBI report build tabs on the laptop, exactly as the VFC would,
// on the local copies of the lake input (sharepoint/reference and
// sharepoint/source), and keeps every file the flows write under
// eu_report/report as stage JSON ({schema, rows}) for
// helper-chartres-write-parquet.py. No network.
// Usage: node scripts/local-report-build.js <out dir> [sites=Hull,Nottingham]
//   [from=2024-12] [to=2026-10] [days=2026-11-01,...] [tables=Plan_OPT_EU,...]
//   [root=<dir with reference/ and source/>]
// Then: python -I scripts/helper-chartres-write-parquet.py <out dir>
//       node scripts/datalake-upload-tree.js <out dir>/report eu_report/report
//         --overwrite                     (WRITES to the data lake)
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runFlow } from './lib-vfc-runner.js';

const TAB1 = ['Plan_OPT_EU', 'Time_Utilisation_EU', 'Daily_Losses_EU'];
const TAB2 = ['Run_Rates_EU', 'Volume_CoV_EU', 'Format_List_EU',
  'Site_PDT_Targets', 'Site_UPDT_Targets'];
const REF = 'eu_report/reference';
const SRC = 'eu_report/pbi_report/source';
const OUT = 'eu_report/report/';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(name + '='));
  return hit ? hit.slice(name.length + 1) : fallback;
};
const outDir = process.argv[2];
if (!outDir || outDir.includes('=')) {
  console.error('usage: node scripts/local-report-build.js <out dir> [sites=..] [from=..] [to=..] [tables=..]');
  process.exit(2);
}
const sites = arg('sites', 'Hull,Nottingham').split(',');
const from = arg('from', '2024-12');
const to = arg('to', '2026-10');
const tables = arg('tables', [...TAB1, ...TAB2].join(',')).split(',');
// days=YYYY-MM-DD,... builds the day files (tab Provideam fetch) instead of months.
const days = arg('days', '') ? arg('days', '').split(',') : null;

const read = (f) => JSON.parse(readFileSync(new URL('../flows/legacy_report_generator_v0/' + f, import.meta.url), 'utf8'));
const config = read('vfc-config.json');
// root=<dir> reads reference/ and source/ from another folder (a test copy).
const root = arg('root', '') ? pathToFileURL(arg('root', '').replace(/\/?$/, '/')) :
  new URL('../sharepoint/', import.meta.url);

// The lake as the flows see it: every local reference and source file.
const lake = new Map();
for (const [group, prefix] of [['reference', REF], ['source', SRC]]) {
  for (const type of readdirSync(new URL(`${group}/`, root))) {
    for (const site of readdirSync(new URL(`${group}/${type}/`, root))) {
      for (const f of readdirSync(new URL(`${group}/${type}/${site}/`, root))) {
        lake.set(`${prefix}/${type}/${site}/${f}`,
          readFileSync(new URL(`${group}/${type}/${site}/${f}`, root), 'utf8'));
      }
    }
  }
}

let files = 0;
let failed = false;
for (const [file, tabTables] of [['vfc-pbi-report.json', TAB1], ['vfc-pbi-report-2.json', TAB2]]) {
  const job = tables.filter((t) => tabTables.includes(t));
  if (!job.length) {
    continue;
  }
  const flow = read(file);
  const stats = await runFlow(flow, {
    startDay: new Date().toISOString().slice(0, 10),
    startPayload: days ? { tables: job, sites, days } : { tables: job, sites, from, to },
    write: true, configNodes: config, platform: 'xcelerator', lake,
    clientId: 'x', clientSecret: 'y',
    fetchImpl: async () => { throw new Error('no API call expected'); }
  });
  console.log(`${file}: errors ${stats.errors.length}`);
  stats.errors.forEach((e) => console.log('  ERROR', String(e).slice(0, 300)));
  stats.logs.filter((l) => /FAILED|WRITING|ERROR/.test(String(l)))
    .forEach((l) => console.log('  ', String(l).slice(0, 300)));
  failed = failed || stats.errors.length > 0;
  const schemas = new Map(flow.filter((n) => n.type === 'parquet')
    .map((n) => [n.name, n.columns.map((c) => [c.column, c.type])]));
  for (const path of stats.written.filter((p) => p.startsWith(OUT))) {
    const table = path.slice(OUT.length).split('/')[0];
    const schema = schemas.get(`Write ${table} parquet`);
    const rows = JSON.parse(lake.get(path));
    const stage = `${outDir}/stage/${path.slice(OUT.length).replace(/\.parquet$/, '.json')}`;
    mkdirSync(dirname(stage), { recursive: true });
    writeFileSync(stage, JSON.stringify({ schema, rows }));
    files++;
  }
}
console.log(`${files} stage file(s) in ${outDir}/stage${existsSync(outDir) ? '' : ' (none)'}`);
process.exit(failed ? 1 : 0);
