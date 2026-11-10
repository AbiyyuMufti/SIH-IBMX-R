// Proof for the live Chartres flow: runs the function nodes y1 to y4 on the
// Base rows the history load used and compares every row and column with the
// stage files of that run (and its filler). Read only on the workbooks.
// Usage: node scripts/test-chartres-live.js <run folder> <lookups json>
//          [filler=<filler folder>] [from=YYYY-MM-DD] [every=N]
// Exit code 1 when a table differs. loaded_at is not compared.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsx } from './lib-office.js';
import { code } from './lib-flow-builder.js';
import { lintFunction } from './validate-flow.js';

const [run, lookupsFile] = process.argv.slice(2).filter((a) => !a.includes('='));
const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)),
);
const FILLER = args.filler ?? null;
const FROM = args.from ?? '2025-01-01';
const EVERY = Number(args.every ?? 1);
const SITE = 'Chartres';
const TABLES = ['Plan_OPT_EU', 'Time_Utilisation_EU', 'Daily_Losses_EU', 'Volume_CoV_EU'];

const lookups = readFileSync(lookupsFile, 'utf8');
const node = { status: () => {}, warn: () => {}, error: () => {} };
const run1 = (file, msg) =>
  new Function('node', 'msg', 'Buffer', code(file).replace("'2026-11-11'", "'2000-01-01'"))(node, msg, Buffer);

// Function-node style (max 80 characters, no trailing comments).
let styleErrors = 0;
for (const file of ['y1-read-row.js', 'y2-plan-time.js', 'y3-loss-rows.js', 'y4-cov-filler.js']) {
  const problems = lintFunction(code(file)).errors;
  for (const p of problems) {
    console.log(`style ${file}: ${p}`);
    styleErrors += 1;
  }
}

// Rows of the history load by table, machine and day number.
const stage = new Map();
const addStage = (table, rows) => {
  for (const r of rows) {
    const k = `${table}|${r.MachineName}|${r.Date}`;
    if (!stage.has(k)) {
      stage.set(k, []);
    }
    stage.get(k).push(r);
  }
};
for (const table of TABLES) {
  const dir = join(run, 'stage', table, `site=${SITE}`);
  for (const f of readdirSync(dir)) {
    addStage(table, JSON.parse(readFileSync(join(dir, f), 'utf8')).rows);
  }
}
if (FILLER) {
  for (const table of ['Plan_OPT_EU', 'Daily_Losses_EU']) {
    const dir = join(FILLER, 'stage', table, `site=${SITE}`);
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        const rows = JSON.parse(readFileSync(join(dir, f), 'utf8')).rows.map((r) => {
          const d = Date.parse(`${r.Date}T00:00:00Z`) / 86400000;
          return { ...r, Date: d, ...(r.ShiftStartDate ? { ShiftStartDate: d } : {}) };
        });
        addStage(table, rows);
      }
    }
  }
}

const canon = (r) =>
  JSON.stringify(
    Object.keys(r)
      .filter((k) => k !== 'loaded_at' && r[k] !== undefined)
      .sort()
      .map((k) => [k, r[k]]),
  );
const diffRow = (a, b) => {
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  // Accepted difference: a filler loss row gets Shift Time = its shift (the
  // history filler has null where its month had no sibling row).
  const accepted = (n) => n === 'Shift Time' && a['Data Source'] === 'Filler' && (b[n] ?? null) === null;
  return [...names].filter(
    (n) => n !== 'loaded_at' && !accepted(n) && JSON.stringify(a[n] ?? null) !== JSON.stringify(b[n] ?? null),
  );
};

// Days of the run, grouped by workbook.
const { days } = JSON.parse(readFileSync(join(run, 'days.json'), 'utf8'));
const byFile = new Map();
days.filter((d) => d.date >= FROM).forEach((d, i) => {
  if (i % EVERY === 0) {
    if (!byFile.has(d.file)) {
      byFile.set(d.file, []);
    }
    byFile.get(d.file).push(d);
  }
});
const root = JSON.parse(readFileSync(join(run, 'days.json'), 'utf8')).root;

const stats = Object.fromEntries(TABLES.map((t) => [t, { days: 0, rowsOk: 0, rowsDiff: 0, columns: {} }]));
const examples = [];
let dayCount = 0;
let rejected = 0;
for (const [file, list] of byFile) {
  const base = readXlsx(join(root, file)).Base;
  const fileName = file.split('/').at(-1);
  for (const d of list) {
    const raw = base[d.baseRow];
    const payload = {};
    base[0].forEach((name, i) => {
      payload[name] = raw[i] === undefined || raw[i] === null ? '' : String(raw[i]);
    });
    payload.FileName = fileName;
    let msg = { payload };
    let out = run1('y1-read-row.js', msg);
    for (const f of ['y2-plan-time.js', 'y3-loss-rows.js']) {
      if (!out[0]) {
        break;
      }
      msg = out[0];
      if (f === 'y2-plan-time.js') {
        msg.payload = lookups;
      }
      out = run1(f, msg);
    }
    if (!out[0]) {
      rejected += 1;
      examples.push(`rejected ${d.line} ${d.date}: ${out[1]?.logText}`);
      continue;
    }
    msg = run1('y4-cov-filler.js', out[0]);
    dayCount += 1;
    const dayNumber = Date.parse(`${d.date}T00:00:00Z`) / 86400000;
    for (const table of TABLES) {
      const want = (stage.get(`${table}|${d.line}|${dayNumber}`) ?? []).slice();
      const got = msg.rows[table].slice();
      // Losses: the history keys ShiftStartDate, Plan the Date.
      const s = stats[table];
      s.days += 1;
      const unmatched = want.map(canon);
      const left = [];
      for (const r of got) {
        const c = canon(r);
        const i = unmatched.indexOf(c);
        if (i >= 0) {
          unmatched.splice(i, 1);
          s.rowsOk += 1;
        } else {
          left.push(r);
        }
      }
      const wantLeft = unmatched.map((c) => Object.fromEntries(JSON.parse(c)));
      s.rowsDiff += Math.max(0, wantLeft.length - left.length);
      left.forEach((r, i) => {
        const w = wantLeft[i];
        if (!w) {
          s.rowsDiff += 1;
          s.columns['(extra row)'] = (s.columns['(extra row)'] ?? 0) + 1;
          examples.push(`${table} ${d.line} ${d.date}: extra row ${JSON.stringify(r).slice(0, 200)}`);
          return;
        }
        const cols = diffRow(r, w);
        if (cols.length === 0) {
          s.rowsOk += 1;
          return;
        }
        s.rowsDiff += 1;
        cols.forEach((c) => {
          s.columns[c] = (s.columns[c] ?? 0) + 1;
        });
        if (examples.length < 25) {
          examples.push(
            `${table} ${d.line} ${d.date}: ${cols.map((c) => `${c} ${JSON.stringify(r[c])} vs ${JSON.stringify(w[c])}`).join('; ')}`,
          );
        }
      });
      if (wantLeft.length > left.length) {
        s.columns['(missing row)'] = (s.columns['(missing row)'] ?? 0) + wantLeft.length - left.length;
      }
    }
  }
}
// Checks of the first node on the real FIRST_DAY and on bad rows.
const raw = (payload) =>
  new Function('node', 'msg', 'Buffer', code('y1-read-row.js'))(node, { payload }, Buffer);
const base = { FileName: 'OEE CLÉOPATRE - 2026.xlsm', ANNEE: '2026', MOIS: '11', JOUR: '5' };
const cases = [
  ['day before FIRST_DAY is ignored with 200', raw(base)[1]?.statusCode === 200],
  ['FIRST_DAY itself goes on', raw({ ...base, JOUR: '11' })[0]?.row?.fileLine === 'CLÉOPATRE'],
  ['no FileName gives 400', raw({ ...base, FileName: '' })[1]?.statusCode === 400],
  ['30 February gives 400', raw({ ...base, MOIS: '2', JOUR: '30' })[1]?.statusCode === 400],
  ['a list gives 400', raw([1])[1]?.statusCode === 400],
  ['a header with trailing space is read', raw({ ...base, JOUR: '12', 'Rupture Formule ': '3' })[0]?.row?.base['Rupture Formule'] === '3'],
];
for (const [text, ok] of cases) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  styleErrors += ok ? 0 : 1;
}
console.log(`days run ${dayCount}, rejected ${rejected}, style problems ${styleErrors}`);
let bad = styleErrors + (rejected > 1 ? rejected : 0);
for (const [table, s] of Object.entries(stats)) {
  bad += s.rowsDiff;
  console.log(`${table}: rows equal ${s.rowsOk}, different ${s.rowsDiff} ${JSON.stringify(s.columns)}`);
}
examples.slice(0, 25).forEach((e) => console.log(`  ${e}`));
process.exit(bad ? 1 : 0);
