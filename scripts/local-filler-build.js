// Step 2 of the local filler build (docs/pbi-report-build.md step 10).
// Runs the VFC function code scripts/vfc/f1-filler-rows.js on every
// <out>/input/<Site>/<period>.json of helper-filler-input.py, with the scope
// of config/report_scope.csv (node code b5-scope-lookup.js). Writes
// <out>/stage/<table>/site=<Site>/<table>_<period>_filler.json
// ({schemaFrom, rows}), <out>/counts.csv and <out>/stale.txt (old filler
// files whose period now has no filler: to delete, after the user's go).
// Usage: node scripts/local-filler-build.js <out>
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { code } from './lib-flow-builder.js';

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/local-filler-build.js <out>');
  process.exit(2);
}
const run = (file, msg, context) => {
  const flow = { get: (k) => context[k], set: (k, v) => { context[k] = v; } };
  const node = { status: () => {}, warn: () => {}, error: () => {} };
  return new Function('flow', 'node', 'msg', code(file))(flow, node, msg);
};

const csv = readFileSync(new URL('../config/report_scope.csv', import.meta.url), 'utf8');
const [head, ...lines] = csv.replace(/\r/g, '').split('\n').filter(Boolean);
const names = head.split(',');
const scopeRows = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [names[i], v])));

const loadedAt = Date.now();
const counts = ['site,period,plan_filler,loss_filler,after_last_day,null_shift_line_days,scope_rule'];
const stale = [];
const total = {};
for (const site of readdirSync(`${out}/input`)) {
  const context = {};
  run('b5-scope-lookup.js', { payload: scopeRows, site }, context);
  for (const file of readdirSync(`${out}/input/${site}`).sort()) {
    const input = JSON.parse(readFileSync(`${out}/input/${site}/${file}`, 'utf8'));
    const msg = run('f1-filler-rows.js', { ...input, loadedAt }, context);
    const c = msg.counts;
    counts.push([site, input.period, c.plan, c.loss, c.afterLastDay, c.nullShift, c.scopeRule].join(','));
    total[site] = total[site] || { plan: 0, loss: 0, afterLastDay: 0, nullShift: 0, scopeRule: 0 };
    Object.keys(total[site]).forEach((k) => { total[site][k] += c[k]; });
    for (const [table, rows] of [['Plan_OPT_EU', msg.fillerPlan], ['Daily_Losses_EU', msg.fillerLoss]]) {
      const name = `${table}_${input.period}_filler`;
      const old = input.oldFiller.filter((p) => p.includes(name));
      if (!rows.length) {
        stale.push(...old);
        continue;
      }
      const dir = `${out}/stage/${table}/site=${site}`;
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}/${name}.json`, JSON.stringify({ schemaFrom: input.schemaFrom[table], rows }));
    }
  }
}
writeFileSync(`${out}/counts.csv`, counts.join('\n') + '\n');
writeFileSync(`${out}/stale.txt`, stale.join('\n') + (stale.length ? '\n' : ''));
console.table(total);
console.log(`stale filler files (to delete after the user's go): ${stale.length}`);
