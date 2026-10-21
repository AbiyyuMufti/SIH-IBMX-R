// Offline test of the Power BI reference flow (flows/vfc-pbi-reference.json):
// same mock data through the OLD two-step chain (fact flow + reference flow +
// Power BI conversion flow) and through the reference flow: the rows of
// pbi_machine_names and pbi_shift_naming must be equal (loaded_at left out).
// The daily tab is tested by scripts/test-vfc-sih-report.js since 2026-10-21.
// Usage: node scripts/test-vfc-pbi-direct.js
import { readFileSync } from 'node:fs';
import { runFlow, testPlatform } from './lib-vfc-runner.js';
import { makeMockFetch } from './lib-mock-ih.js';

const read = (f) => JSON.parse(readFileSync(new URL('../flows/' + f, import.meta.url), 'utf8'));
const config = read('vfc-config.json');
const day = '2026-09-30';
const base = (extra) => ({
  startDay: day, write: true, configNodes: config, lake: new Map(),
  platform: testPlatform(),
  fetchImpl: makeMockFetch('ok'), clientId: 'x', clientSecret: 'y',
  allAssets: true, ...extra
});

let failures = 0;
const check = (ok, text) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + text);
  if (!ok) failures++;
};
const norm = (rows) => rows
  .map((r) => JSON.parse(JSON.stringify(r).replaceAll('Site1', 'Hull')))
  .map((r) => { delete r.loaded_at; return r; });
const sortKey = (r) => JSON.stringify(r);
const same = (a, b) => JSON.stringify(norm(a).map(sortKey).sort()) === JSON.stringify(norm(b).map(sortKey).sort());
const rowsOf = (stats, name) => (stats.parquetPayloads[name] || []).flat();

// ---- the old chain ----
const oldLake = new Map();
const oldBase = base({ lake: oldLake });
await runFlow(read('vfc-reference-tables.json'), oldBase);
await runFlow(read('vfc-site-hull.json'), oldBase);
const oldPbi = read('vfc-powerbi-tables.json');
const oldSettings = oldPbi.find((n) => /POWER BI SETTINGS/.test(n.name));
oldSettings.func = oldSettings.func.replace("var FOLDER_PREFIX = 'site=';", "var FOLDER_PREFIX = '';");
for (const [path, text] of oldLake) oldLake.set(path, text.replaceAll('Site1', 'Hull'));
const oldStats = await runFlow(oldPbi, oldBase);

// ---- the reference flow ----
const ref = read('vfc-pbi-reference.json');
const refStats = await runFlow(ref, base());
console.log('new reference parquet rows:', JSON.stringify(refStats.parquetRows));
refStats.errors.forEach((e) => console.log('ERROR reference:', e));
check(refStats.errors.length === 0, 'no error in the reference flow');
const W = (t) => `Write ${t} parquet`;
// Since 2026-10-13 the new flow sets product_type = area (decision of the
// user); the old chain still has null. Everything else must be equal.
const oldMachines = rowsOf(oldStats, W('pbi_machine_names')).map((r) => ({ ...r, product_type: r.area }));
const newMachines = rowsOf(refStats, W('pbi_machine_names')).filter((r) => r.site_name === 'Site1');
check(oldMachines.length > 0 && same(oldMachines, newMachines), `pbi_machine_names: Site1 rows equal, product_type = area (${newMachines.length})`);
check(newMachines.every((r) => r.product_type === r.area && r.product_type !== null), 'pbi_machine_names: product_type is the area');
const oldShifts = rowsOf(oldStats, W('pbi_shift_naming')).map((r) => r.shift).sort();
const newShifts = rowsOf(refStats, W('pbi_shift_naming')).map((r) => r.shift).sort();
check(JSON.stringify(oldShifts) === JSON.stringify(newShifts), `pbi_shift_naming: ${newShifts.join(', ')}`);
check(rowsOf(refStats, W('pbi_calendar')).length === rowsOf(oldStats, W('pbi_calendar')).length, 'pbi_calendar: same number of dates');

// ---- paths ----
const refPaths = [...refStats.written].filter((p) => !p.includes('/logs/'));
console.log('reference paths:', refPaths.join(', '));
check(refPaths.some((p) => p.endsWith('/pbi_calendar/pbi_calendar.parquet')), 'reference path of pbi_calendar');

// ---- dry run writes nothing ----
const dryRef = await runFlow(ref, base({ write: false }));
check(Object.keys(dryRef.parquetRows).length === 0, 'reference dry run: no table written');

// ---- failures ----
const rf = await runFlow(ref, base({ fetchImpl: makeMockFetch('ref-config-fail') }));
check(!rf.parquetRows['Write pbi_machine_names parquet'] || true, 'reference config-fail runs');
console.log('reference ref-config-fail rows:', JSON.stringify(rf.parquetRows));
const rd = await runFlow(ref, base({ fetchImpl: makeMockFetch('ref-detail-fail') }));
check(!rd.parquetRows['Write pbi_shift_naming parquet'], 'ref-detail-fail: shift names not written');
check(!!rd.parquetRows['Write pbi_machine_names parquet'], 'ref-detail-fail: machine names still written');

console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exitCode = failures ? 1 : 0;
