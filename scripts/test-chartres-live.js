// Proof for the live Chartres flow: loads the reference files the tab reads
// (the lookup nodes of the tab run on the CSV files of sharepoint/reference),
// runs the function nodes y1 to y5 on the Base rows the history load used and
// compares every row and column with the stage files of that run (and filler).
// Usage: node scripts/test-chartres-live.js <run folder> [filler=<folder>]
//          [from=YYYY-MM-DD] [every=N]
// Read only on the workbooks. Exit code 1 when a table differs. loaded_at is
// not compared.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsx } from './lib-office.js';
import { code } from './lib-flow-builder.js';
import { lintFunction } from './validate-flow.js';
import { liveCode, LIVE_TABLES } from './lib-chartres-live.js';

const run = process.argv.slice(2).find((a) => !a.includes('='));
const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)),
);
const FILLER = args.filler ?? null;
const FROM = args.from ?? '2025-01-01';
const EVERY = Number(args.every ?? 1);
const SITE = 'Chartres';
const TABLES = Object.keys(LIVE_TABLES);

// ---- Function nodes with a fake flow context ----
const context = {};
const flow = { get: (k) => context[k], set: (k, v) => { context[k] = v; } };
const nodeApi = { status: () => {}, warn: () => {}, error: () => {} };
const glob = { get: () => ({ root: 'eu_report' }) };
const source = (file) => liveCode(file, code);
const runNode = (file, msg, fix = (t) => t) =>
  new Function('node', 'msg', 'flow', 'glob', 'Buffer', fix(source(file)))(nodeApi, msg, flow, glob, Buffer);
// y1 with the first live day moved back, to test the real days of the run.
const early = (t) => t.replace("'2026-11-11'", "'2000-01-01'");

// Function-node style (max 80 characters, no trailing comments).
const NODES = [
  'y0-settings.js', 'y0-check-ready.js', 'y0-ref-list.js', 'y0-ref-folder.js', 'y0-ref-route.js',
  'y0-loss-lookup.js', 'y0-ref-done.js', 'y1-read-row.js', 'y2-plan-time.js', 'y3-loss-rows.js',
  'y4-cov-filler.js', 'y5-route-tables.js', 'y5-set-path.js', 'y6-answer.js',
];
let bad = 0;
for (const file of NODES) {
  for (const p of lintFunction(source(file)).errors) {
    console.log(`style ${file}: ${p}`);
    bad += 1;
  }
}

// ---- Reference files (CSV) ----
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      row.push(cell);
      cell = '';
      if (row.some((x) => x !== '')) {
        rows.push(row);
      }
      row = [];
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const newestCsv = (dir) => {
  const names = readdirSync(dir).filter((f) => /\.csv$/i.test(f)).sort();
  return join(dir, names.at(-1));
};
const REF = 'sharepoint/reference';
const refs = [
  ['b5-machine-lookup.js', newestCsv(`${REF}/machine_names/site=${SITE}`)],
  ['b5-target-lookup.js', newestCsv(`${REF}/glidepaths/site=${SITE}`)],
  ['b5-format-lookup.js', newestCsv(`${REF}/format_list/site=${SITE}`)],
  // The scope file of the lake is config/report_scope.csv (uploaded 2026-11-09).
  ['b5-scope-lookup.js', 'config/report_scope.csv'],
  ['y0-loss-lookup.js', newestCsv(`${REF}/localisation/site=${SITE}`)],
];
for (const [node, file] of refs) {
  const msg = { site: SITE, payload: parseCsv(readFileSync(file, 'utf8')) };
  const out = runNode(node, msg);
  const result = Array.isArray(out) ? out[1] ?? out[0] : out;
  if (!result || result.payload?.failed) {
    console.log(`FAIL reference ${node} ${file}: ${JSON.stringify(result?.payload)}`);
    bad += 1;
  }
}
console.log(`reference: ${Object.keys(context).filter((k) => k.endsWith('_Chartres')).join(', ')}`);

// ---- Rows of the history load, by table, machine and day number ----
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
    for (const f of readdirSync(dir)) {
      const rows = JSON.parse(readFileSync(join(dir, f), 'utf8')).rows.map((r) => {
        const d = Date.parse(`${r.Date}T00:00:00Z`) / 86400000;
        return { ...r, Date: d, ...(r.ShiftStartDate ? { ShiftStartDate: d } : {}) };
      });
      addStage(table, rows);
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
  // Accepted: a filler loss row gets Shift Time = its shift (the history filler
  // has null where its month had no sibling row).
  const accepted = (n) => n === 'Shift Time' && a['Data Source'] === 'Filler' && (b[n] ?? null) === null;
  return [...names].filter(
    (n) => n !== 'loaded_at' && !accepted(n) && JSON.stringify(a[n] ?? null) !== JSON.stringify(b[n] ?? null),
  );
};

// ---- Days of the run, grouped by workbook ----
const info = JSON.parse(readFileSync(join(run, 'days.json'), 'utf8'));
const byFile = new Map();
info.days.filter((d) => d.date >= FROM).forEach((d, i) => {
  if (i % EVERY === 0) {
    if (!byFile.has(d.file)) {
      byFile.set(d.file, []);
    }
    byFile.get(d.file).push(d);
  }
});

const stats = Object.fromEntries(TABLES.map((t) => [t, { rowsOk: 0, rowsDiff: 0, columns: {} }]));
const examples = [];
let dayCount = 0;
let rejected = 0;
let routed = 0;
for (const [file, list] of byFile) {
  const base = readXlsx(join(info.root, file)).Base;
  const fileName = file.split('/').at(-1);
  for (const d of list) {
    const raw = base[d.baseRow];
    const payload = {};
    base[0].forEach((name, i) => {
      payload[name] = raw[i] === undefined || raw[i] === null ? '' : String(raw[i]);
    });
    payload.FileName = fileName;
    let out = runNode('y1-read-row.js', { payload }, early);
    for (const f of ['y2-plan-time.js', 'y3-loss-rows.js']) {
      if (!out[0]) {
        break;
      }
      out = runNode(f, out[0]);
    }
    if (!out[0]) {
      rejected += 1;
      examples.push(`rejected ${d.line} ${d.date}: ${out[1]?.logText}`);
      continue;
    }
    const msg = runNode('y4-cov-filler.js', out[0]);
    dayCount += 1;
    // y5 in write mode: one message per table, only the columns of the schema.
    context.cfg = { dryRun: false, liveFolder: 'eu_report/report', site: SITE, source: 'excel' };
    const sent = runNode('y5-route-tables.js', msg);
    TABLES.forEach((table, i) => {
      const names = LIVE_TABLES[table].map(([n]) => n);
      const wrong = sent[i].payload.some((r) => Object.keys(r).join('|') !== names.join('|'));
      if (wrong || sent[i].payload.length !== msg.rows[table].length) {
        bad += 1;
        examples.push(`y5 ${table} ${d.line} ${d.date}: columns or row count differ from the schema`);
      }
    });
    routed += 1;
    const dayNumber = Date.parse(`${d.date}T00:00:00Z`) / 86400000;
    for (const table of TABLES) {
      const want = (stage.get(`${table}|${d.line}|${dayNumber}`) ?? []).slice();
      const s = stats[table];
      const unmatched = want.map(canon);
      const left = [];
      for (const r of msg.rows[table]) {
        const i = unmatched.indexOf(canon(r));
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

// ---- Checks of the request path on bad rows and the real FIRST_DAY ----
const first = (payload) => runNode('y1-read-row.js', { payload });
const row0 = { FileName: 'OEE CLÉOPATRE - 2026.xlsm', ANNEE: '2026', MOIS: '11', JOUR: '5' };
const notReady = () => {
  const saved = context.chartres_ready;
  delete context.chartres_ready;
  const out = runNode('y0-check-ready.js', { row: { iso: '2026-11-12' } });
  context.chartres_ready = saved;
  return out;
};
const cases = [
  ['day before FIRST_DAY is ignored with 200', first(row0)[1]?.statusCode === 200],
  ['FIRST_DAY itself goes on', first({ ...row0, JOUR: '11' })[0]?.row?.fileLine === 'CLÉOPATRE'],
  ['no FileName gives 400', first({ ...row0, FileName: '' })[1]?.statusCode === 400],
  ['30 February gives 400', first({ ...row0, MOIS: '2', JOUR: '30' })[1]?.statusCode === 400],
  ['a list gives 400', first([1])[1]?.statusCode === 400],
  [
    'a header with trailing space is read',
    first({ ...row0, JOUR: '12', 'Rupture Formule ': '3' })[0]?.row?.base['Rupture Formule'] === '3',
  ],
];
// A line that is not in Machine Names gives 400.
const unknown = runNode('y2-plan-time.js', first({ ...row0, FileName: 'OEE NOPE - 2026.xlsm', JOUR: '12' })[0]);
cases.push(['unknown line gives 400', unknown[1]?.statusCode === 400]);
// Reference not loaded yet: 503, loaded: the request goes on.
cases.push(['not ready gives 503', notReady()[1]?.statusCode === 503]);
context.chartres_ready = { at: 1 };
cases.push(['ready goes on', runNode('y0-check-ready.js', { row: {} })[0] !== null]);
// Dry run: nothing goes to the tables, the answer says so.
context.cfg = { dryRun: true, liveFolder: 'eu_report/report', site: SITE, source: 'excel' };
const dry = runNode('y5-route-tables.js', {
  rows: { Plan_OPT_EU: [], Time_Utilisation_EU: [], Daily_Losses_EU: [], Volume_CoV_EU: [] },
  day: { iso: '2026-11-12', machine: 'ZEUS' },
});
cases.push(['dry run sends no table message', dry.slice(0, 4).every((m) => m === null) && dry[4].statusCode === 200]);
// The file path of a table, line and day.
context.cfg = { liveFolder: 'eu_report/report', site: SITE, source: 'excel' };
const pathMsg = runNode('y5-set-path.js', { iso: '2026-11-12', machine: 'ZEUS' }, (t) => t.replace('__TABLE__', 'Plan_OPT_EU'));
cases.push([
  'path of one table, line and day',
  pathMsg.path === 'eu_report/report/Plan_OPT_EU/site=Chartres/Plan_OPT_EU_2026-11-12_ZEUS_excel.parquet',
]);
// The refresh counter: ready only when all five types came in without failure.
context.chartres_ready = undefined;
runNode('y0-ref-list.js', { payload: null });
const runId = context.chartres_run.id;
const types = ['machines', 'glidepaths', 'formats', 'scope', 'losses'];
const results = types.map((type, i) =>
  runNode('y0-ref-done.js', { type, runId, payload: i === 4 ? 'Chartres' : 'Chartres' }));
cases.push(['refresh ends ready after five types', results.slice(0, 4).every((r) => r === null) && results[4]?.level === 'info' && context.chartres_ready?.at > 0]);
context.chartres_ready = undefined;
runNode('y0-ref-list.js', { payload: null });
const runId2 = context.chartres_run.id;
const failing = types.map((type, i) =>
  runNode('y0-ref-done.js', { type, runId: runId2, payload: i === 2 ? { failed: 'no csv' } : 'Chartres' }));
cases.push(['a failed type keeps the tab not ready', failing[4]?.level === 'failed' && !context.chartres_ready]);
for (const [text, ok] of cases) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  bad += ok ? 0 : 1;
}

console.log(`days run ${dayCount}, rejected ${rejected}, y5 checked ${routed}, style/check problems ${bad}`);
let diff = 0;
for (const [table, s] of Object.entries(stats)) {
  console.log(`${table}: rows equal ${s.rowsOk}, different ${s.rowsDiff} ${JSON.stringify(s.columns)}`);
  diff += s.rowsDiff;
}
examples.slice(0, 25).forEach((e) => console.log(`  ${e}`));
// Known: IWKA1 2025-02-29 is not a date (rejected, its history rows are missing).
process.exit(bad > 0 || diff > 22 ? 1 : 0);
