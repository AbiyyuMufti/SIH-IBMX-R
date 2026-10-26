// Uploads the Historical_OEE_EU parquet files made by
// scripts/historical-oee-convert.js and helper-chartres-write-parquet.py.
// Without --yes it only lists what would be uploaded (no network). With
// --yes it WRITES to the data lake: <out>/report/... -> eu_report/report/...
// through scripts/datalake-upload-tree.js (an existing file is skipped).
// Usage: node scripts/historical-oee-upload.js <out> [--yes]
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const LAKE_ROOT = 'eu_report/report';
const TABLE = 'Historical_OEE_EU';
const out = process.argv[2];
const go = process.argv.includes('--yes');
if (!out) {
  console.error('usage: node scripts/historical-oee-upload.js <out> [--yes]');
  process.exit(2);
}

const local = join(out, 'report');
const files = [];
const walk = (dir) => readdirSync(dir).forEach((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) {
    walk(path);
  } else if (name.endsWith('.parquet')) {
    files.push(path);
  }
});
walk(local);
const wrong = files.filter((f) => !relative(local, f).startsWith(TABLE + sep));
if (!files.length || wrong.length) {
  console.error(`expected only ${TABLE} parquet files under ${local}: found ${files.length}, ` +
    `other ${wrong.join(', ')}`);
  process.exit(1);
}
files.forEach((f) => {
  const target = `${LAKE_ROOT}/${relative(local, f).split(sep).join('/')}`;
  console.log(`${f} (${statSync(f).size} bytes) -> ${target}`);
});
if (!go) {
  console.log('nothing uploaded: add --yes to upload these files');
  process.exit(0);
}
const run = spawnSync(process.execPath, ['scripts/datalake-upload-tree.js', local, LAKE_ROOT],
  { stdio: 'inherit' });
process.exit(run.status ?? 1);
