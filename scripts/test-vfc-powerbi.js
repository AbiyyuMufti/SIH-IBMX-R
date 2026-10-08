// Offline test of the Power BI tables flow. Runs the reference flow and the
// Hull fact flow on the mock into one in-memory lake, then the Power BI flow
// on the files they wrote. Usage: node scripts/test-vfc-powerbi.js
import { readFileSync } from 'node:fs';
import { runFlow } from './lib-vfc-runner.js';
import { makeMockFetch } from './lib-mock-ih.js';

const read = (f) => JSON.parse(readFileSync(new URL('../flows/' + f, import.meta.url), 'utf8'));
const config = read('vfc-config.json');
const lake = new Map();
const day = '2026-09-30';
const base = {
  startDay: day, write: true, configNodes: config, lake,
  fetchImpl: makeMockFetch('ok'), clientId: 'x', clientSecret: 'y',
  allAssets: true
};

let failures = 0;
const check = (ok, text) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + text);
  if (!ok) failures++;
};

await runFlow(read('vfc-reference-tables.json'), base);
await runFlow(read('vfc-site-hull.json'), base);
console.log('lake after sources:', [...lake.keys()].filter((k) => !k.includes('/logs/')).join(', '));

// The test lake of the fact flow has no site= prefix: patch the PBI flow.
const pbi = read('vfc-powerbi-tables.json');
const settings = pbi.find((n) => /POWER BI SETTINGS/.test(n.name));
settings.func = settings.func.replace("var FOLDER_PREFIX = 'site=';", "var FOLDER_PREFIX = '';");
// The mock hierarchy calls the site Site1, the real one Hull.
for (const [path, text] of lake) lake.set(path, text.replaceAll('Site1', 'Hull'));
const stats = await runFlow(pbi, base);
stats.logs.forEach((l) => console.log('LOG:', String(l).slice(0, 200)));
stats.errors.forEach((e) => console.log('ERROR:', e));
stats.warnings.forEach((w) => console.log('WARN:', w));
console.log('parquet rows:', JSON.stringify(stats.parquetRows));
const rows = (name) => (stats.parquetPayloads[name] || []).flat();
const plan = rows('Write pbi_plan_opt parquet');
const util = rows('Write pbi_time_utilisation parquet');
const loss = rows('Write pbi_daily_losses parquet');
check(stats.errors.length === 0, 'no error');
check(plan.length > 0 && util.length > 0 && loss.length > 0, 'plan, util and loss rows exist');
check(rows('Write pbi_calendar parquet').length === 1095, 'calendar has 1095 dates');
check(rows('Write pbi_machine_names parquet').length > 0, 'machine names written');
check(rows('Write pbi_shift_naming parquet').length > 0, 'shift names written');
if (plan.length) console.log('plan row 1:', JSON.stringify(plan[0]));
if (util.length) console.log('util row 1:', JSON.stringify(util[0]));
if (loss.length) console.log('loss row 1:', JSON.stringify(loss[0]));
// Shift rule and sums on a small synthetic day (one 12 h shift, 10 day cycle).
import vm from 'node:vm';
const planCode = pbi.find((n) => /Build plan opt rows/.test(n.name)).func;
const H = 3600000;
const t0 = Date.parse('2026-09-06T06:00:00Z');
const kpi = (i, extra) => ({
  asset_id: 'A', site: 'Hull', area: 'Bottles', asset_name: 'B2 Line',
  production_day: '2026-09-16', period_start: new Date(Date.parse('2026-09-16T06:00:00Z') + i * H).toISOString(),
  good_parts: 100, total_time_ms: H, planned_stop_shift_plan_ms: 0,
  operational_time_ms: H, used_operational_time_ms: null, ...extra
});
const tables = {
  dim_asset: [{ asset_id: 'A', calendar_id: 'C' }],
  dim_shift: [{ calendar_id: 'C', shift_name: 'Red', freq: 'DAILY', interval: 10, start_utc: t0, until_utc: null, duration_ms: 12 * H }],
  fact_kpi: [kpi(0), kpi(1, { used_operational_time_ms: 30 * 60000 }), kpi(13), kpi(2, { planned_stop_shift_plan_ms: H / 2 })]
};
const out = vm.runInNewContext('(function(msg,flow){' + planCode + '\n})', {})({ tables }, { get: () => ({}) });
const red = out.planRows.find((r) => r.shift_name === 'Red');
const none = out.planRows.find((r) => r.shift_name === null);
check(red && red.source_hours === 3, 'hours 06, 07, 08 on 16 Sep are in the Red shift (3 rows)');
check(none && none.source_hours === 1, 'hour 19:00 is outside every shift: shift_name null');
check(red && red.good_parts === 300, 'good parts summed');
check(red && red.total_time === 150, 'total time = sum of (total - shift plan stop), in minutes');
check(red && red.oee_time === 30, 'oee time = used operational time in minutes (null rows skipped)');
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exitCode = failures ? 1 : 0;
