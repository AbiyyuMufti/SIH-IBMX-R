// Daily refresh of EU_OEE_Fact from this PC (the VFC flows are not imported).
// Steps: wait for 07:10 UTC, refresh the reference files, fetch the last days
// from the real Provideam API, build the report tables with the VFC flow code,
// overlay them on the working copy, build EU_OEE_Fact (65 columns), check it
// against the live lake files, back the live files up, upload the changed
// month files of Hull, Nottingham and Weinheim, verify. Chartres is untouched.
// Usage: node scripts/local-daily-refresh.js [--upload] [--force]
//   [--end=YYYY-MM-DD] [--days=4]
//   no --upload: everything except the lake write (a dry run)
//   --force: ignore the 07:10 UTC rule      --end: last production day
//   --days: window length (the last 4 days, late corrections arrive)
// Folder: parquet/daily_refresh/ (git-ignored, client data). Log:
// parquet/daily_refresh/logs/refresh_<stamp>.log, result: last-run.txt.
// Docs: docs/local-daily-refresh.md. Secrets stay in .env (never printed).
import { spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, openSync, closeSync, readFileSync,
  readdirSync, writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(REPO, 'parquet', 'daily_refresh');
const SEED_PARTS = join(REPO, 'parquet', 'rr_20261112', 'parts');
const SITES = ['Hull', 'Nottingham', 'Weinheim'];
const TABLES = [
  'Plan_OPT_EU', 'Time_Utilisation_EU', 'Daily_Losses_EU', 'Run_Rates_EU',
  'Volume_CoV_EU', 'Format_List_EU', 'Site_PDT_Targets', 'Site_UPDT_Targets'
];
const START_AFTER_UTC = '07:10';
const NODE = process.execPath;
const PYTHON = process.env.PYTHON || 'C:\\Anaconda\\python.exe';
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const UPLOAD = process.argv.includes('--upload');
const FORCE = process.argv.includes('--force');

const now = new Date();
const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
mkdirSync(join(BASE, 'logs'), { recursive: true });
const logPath = join(BASE, 'logs', `refresh_${stamp}.log`);
const logFd = openSync(logPath, 'a');
const say = (text) => {
  const line = `[${new Date().toISOString().slice(11, 19)}Z] ${text}\n`;
  process.stdout.write(line);
  writeFileSync(logFd, line);
};
const result = (state, text) => {
  say(`${state}: ${text}`);
  writeFileSync(join(BASE, 'last-run.txt'),
    `${now.toISOString()} ${state}${UPLOAD ? '' : ' (dry run)'}\n${text}\n`);
  closeSync(logFd);
  process.exit(state === 'OK' ? 0 : 1);
};

// Runs a command, its output goes to the log. Returns {code, out}.
function run(label, cmd, args, outFile = null) {
  say(`> ${label}`);
  const target = outFile ? join(BASE, 'logs', outFile) : null;
  const fd = target ? openSync(target, 'w') : logFd;
  const r = spawnSync(cmd, args, {
    cwd: REPO,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  });
  if (target) {
    closeSync(fd);
  }
  const out = target ? readFileSync(target, 'utf8') : '';
  if (target) {
    writeFileSync(logFd, out);
  }
  return { code: r.status, out };
}
const must = (r, label) => {
  if (r.code !== 0) {
    result('FAILED', `${label} (exit ${r.code}), see ${logPath}`);
  }
};

// ---- window ----
const hhmm = now.toISOString().slice(11, 16);
if (!FORCE && hhmm < START_AFTER_UTC) {
  result('SKIPPED', `${hhmm} UTC is before ${START_AFTER_UTC} UTC (use --force)`);
}
const dayMs = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const end = arg('end', iso(now.getTime() - dayMs));
const length = Number(arg('days', '4'));
const start = iso(Date.parse(end) - (length - 1) * dayMs);
const days = [];
for (let t = Date.parse(start); t <= Date.parse(end); t += dayMs) {
  days.push(iso(t));
}
const months = [...new Set(days.map((d) => d.slice(0, 7)))];
say(`window ${start} .. ${end} (${days.length} days), months ${months.join(', ')}, ` +
  `${UPLOAD ? 'UPLOAD' : 'dry run'}`);

// ---- 0. working copy ----
const parts = join(BASE, 'parts');
if (!existsSync(parts)) {
  say('first run: seeding parts from parquet/rr_20261112/parts');
  if (!existsSync(SEED_PARTS)) {
    result('FAILED', 'seed folder parquet/rr_20261112/parts is missing');
  }
  cpSync(SEED_PARTS, parts, { recursive: true });
}
const lake = join(BASE, 'lake');

// ---- 1. reference files and the line list from the lake (read only) ----
for (const prefix of ['eu_report/reference/', 'eu_report/report/Dim/']) {
  must(run(`download ${prefix}`, NODE,
    ['scripts/datalake-download-tree.js', prefix, '--max', '2000', '--out', lake]),
  `download ${prefix}`);
}
cpSync(join(lake, 'eu_report', 'report', 'Dim'),
  join(parts, 'eu_report', 'report', 'Dim'), { recursive: true });

// ---- 2. Provideam fetch (real API, read-style) ----
const root = join(lake, 'eu_report');
must(run('Provideam fetch', NODE, [
  'scripts/local-provideam-fetch.js', root, `start=${start}`, `end=${end}`,
  `sites=${SITES.join(',')}`
]), 'Provideam fetch');

// ---- 3. build the report tables with the VFC flow code ----
const built = join(BASE, `build_${stamp}`);
must(run('report tables', NODE, [
  'scripts/local-report-build.js', built, `sites=${SITES.join(',')}`,
  `days=${days.join(',')}`, `root=${root}`
]), 'report build');
must(run('write parquet', PYTHON,
  ['-I', 'scripts/helper-chartres-write-parquet.py', built]), 'write parquet');
let copied = 0;
for (const table of TABLES) {
  const from = join(built, 'report', table);
  if (!existsSync(from)) {
    continue;
  }
  cpSync(from, join(parts, 'eu_report', 'report', table), { recursive: true });
  copied++;
}
say(`overlaid ${copied} tables on the working copy`);

// ---- 4. EU_OEE_Fact (65 columns) ----
const out = join(BASE, `out_${stamp}`);
const shifts = join(root, 'reference', 'shift_naming', 'site=All',
  'Shift Patterns Provideam EU.csv');
must(run('EU_OEE_Fact build', PYTHON, [
  'scripts/eu_oee_fact_rr_build.py', 'build', '--parts', parts,
  '--out', out, '--shifts', shifts
]), 'fact build');
const check = run('EU_OEE_Fact check', PYTHON, [
  'scripts/eu_oee_fact_rr_build.py', 'check', '--parts', parts,
  '--out', out, '--shifts', shifts
], `check_${stamp}.txt`);
if (check.code !== 0 || /\bFAIL\b/.test(check.out)) {
  result('FAILED', `fact check failed (exit ${check.code}), see ${logPath}`);
}

// ---- 5. back up the live files, guard ----
const backup = join(BASE, `backup_${stamp}`);
must(run('backup of the live EU_OEE_Fact', NODE, [
  'scripts/datalake-download-tree.js', 'eu_report/report/EU_OEE_Fact/',
  '--max', '2000', '--out', backup
]), 'backup download');
const factRel = join('eu_report', 'report', 'EU_OEE_Fact');
const guard = run('guard', PYTHON, [
  'scripts/eu_oee_fact_refresh_guard.py', join(out, factRel),
  join(backup, factRel), start, SITES.join(','), months.join(',')
], `guard_${stamp}.txt`);
if (guard.code !== 0) {
  result('FAILED', `guard failed, nothing uploaded, see ${logPath}`);
}

// ---- 6. stage the files and upload ----
const stage = join(BASE, `upload_${stamp}`, factRel);
let files = 0;
for (const site of SITES) {
  for (const ym of months) {
    const name = `EU_OEE_Fact_${ym}.parquet`;
    const from = join(out, factRel, `site=${site}`, name);
    if (existsSync(from)) {
      mkdirSync(join(stage, `site=${site}`), { recursive: true });
      cpSync(from, join(stage, `site=${site}`, name));
      files++;
    }
  }
}
say(`${files} month file(s) staged in ${stage}`);
if (!UPLOAD) {
  result('OK', `dry run, nothing uploaded; ${files} file(s) staged, backup ${backup}`);
}
must(run('upload', NODE, [
  'scripts/datalake-upload-tree.js', stage, 'eu_report/report/EU_OEE_Fact',
  '--overwrite'
]), 'upload');
const verify = run('verify', NODE, [
  'scripts/datalake-verify-tree.js', stage, 'eu_report/report/EU_OEE_Fact', '3'
], `verify_${stamp}.txt`);
if (verify.code !== 0 || /missing [1-9]|size differs [1-9]|identical: false/.test(verify.out)) {
  result('FAILED', `verify failed, the upload may be incomplete; backup ${backup}`);
}
const rows = readdirSync(stage, { recursive: true }).length;
result('OK', `${files} file(s) uploaded and verified (${rows} entries), window ${start}..${end}, ` +
  `backup ${backup}`);
