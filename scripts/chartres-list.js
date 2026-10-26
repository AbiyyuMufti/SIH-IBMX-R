// Lists the Chartres OEE files inside the group zips: <group>/<year>/SAISIE OEE/OEE*.xlsm.
// SKIN CARE 2025 sits one level deeper (2026/2025/...): accepted, the path column shows it.
// Usage: node scripts/chartres-list.js [zipFolder]   (default downloads/Chartres)
// With extract=<emptyFolder> it unzips ONLY those files into that new folder.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv.find((a, i) => i > 1 && !a.includes('=')) ?? 'downloads/Chartres';
const extract = (process.argv.find((a) => a.startsWith('extract=')) ?? '').slice(8);
const GROUPS = ['CREAM Chartres', 'DOR L3', 'NON TISSE', 'SKIN CARE'];
const WANTED = /^(?:\d{4}\/)?(\d{4})\/SAISIE OEE\/(OEE[^/]*\.xlsm)$/i;

const found = [];
const other = [];
for (const group of GROUPS) {
  const zip = join(root, `${group}.zip`);
  const out = execFileSync('unzip', ['-l', zip], { maxBuffer: 1 << 28 }).toString('utf8');
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+\S+\s+\S+\s+(.+?)\r?$/);
    if (!m) {
      continue;
    }
    const hit = m[2].match(WANTED);
    if (hit) {
      found.push({ group, year: hit[1], name: hit[2], size: Number(m[1]), path: m[2] });
    } else if (/\.xlsm$/i.test(m[2]) && /OEE/i.test(m[2])) {
      other.push({ group, size: Number(m[1]), path: m[2] });
    }
  }
}

console.log('| Group | Year | File | Size (MB) | Path in zip |');
console.log('|---|---|---|---|---|');
for (const f of found) {
  console.log(`| ${f.group} | ${f.year} | ${f.name} | ${(f.size / 1048576).toFixed(1)} | ${f.path.split('/SAISIE')[0]} |`);
}
console.log('\nOther .xlsm with OEE in the path (not matching the pattern):');
for (const o of other) {
  console.log(`${o.group} | ${(o.size / 1048576).toFixed(1)} MB | ${o.path}`);
}

if (extract) {
  if (existsSync(extract) && readdirSync(extract).length > 0) {
    throw new Error(`${extract} is not empty: use a new folder`);
  }
  mkdirSync(extract, { recursive: true });
  for (const group of GROUPS) {
    // unzip prints accented names mangled: a wildcard matches them
    const list = found
      .filter((f) => f.group === group)
      .map((f) => f.path.replace(/[^ -~]+/g, '*'));
    if (list.length > 0) {
      execFileSync('unzip', ['-q', join(root, `${group}.zip`), ...list, '-d', extract], {
        maxBuffer: 1 << 28,
      });
    }
  }
  console.log(`\nExtracted ${found.length} files into ${extract}`);
}
