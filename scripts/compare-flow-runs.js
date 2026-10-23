// Runs a report flow file on the mock scenarios and writes its requests,
// logs, errors and parquet rows to one JSON file, to compare an old and a
// new build of the same flow (refactor proof).
// Usage: node scripts/compare-flow-runs.js <flow.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { runFlow, testPlatform } from './lib-vfc-runner.js';
import { makeMockFetch } from './lib-mock-ih.js';

const [flowFile, outFile] = process.argv.slice(2);
const flow = JSON.parse(readFileSync(flowFile, 'utf8'));
const config = JSON.parse(readFileSync(new URL('../flows/vfc-config.json', import.meta.url), 'utf8'));
const scenarios = ['ok', 'products', 'value-413-day', 'value-kpi-fail', 'products-fail', 'kpi-413-day', 'kpi-fail'];
const result = {};
for (const scenario of scenarios) {
  const s = await runFlow(flow, {
    startDay: '2026-09-29', endDay: '2026-09-30', write: true, configNodes: config,
    lake: new Map(), platform: testPlatform(), fetchImpl: makeMockFetch(scenario),
    clientId: 'x', clientSecret: 'y', allAssets: true
  });
  result[scenario] = {
    requests: s.requests.map((q) => `${q.method} ${q.url} ${q.body || ''}`).sort(),
    errors: s.errors.map(String).sort(),
    logs: s.logs.map((l) => String(l).replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'T')).sort(),
    parquet: s.parquetPayloads
  };
}
writeFileSync(outFile, JSON.stringify(result, null, 1));
console.log('written', outFile);
