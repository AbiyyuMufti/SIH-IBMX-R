// Downloads data lake files by their known names and zips them (run it on
// your own computer, it needs .env). One POST: generateDownloadObjectUrls.
// Usage: node scripts/datalake-download.js probe <path>
//        node scripts/datalake-download.js days <prefix> <from> <to> [ext]
//   probe = asks for ONE signed URL, prints status and field names, no download
//   days  = <prefix>YYYY-MM-DD.<ext> for every day, e.g.
//           fact_kpi/site=Hull/fact_kpi_ 2026-09-01 2026-09-30
// Output: downloads/<path> and downloads/datalake-<name>.zip (zip command).
// Signed URLs and tokens are never printed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cfg, getToken } from './lib-ih.js';

const BATCH = 50;
const OUT = resolve(import.meta.dirname, '..', 'downloads');

async function signedUrls(token, paths) {
  const url = cfg.gateway + '/api/datalake/v3/generateDownloadObjectUrls';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ paths: paths.map((path) => ({ path })) })
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch (e) {
    body = null;
  }
  return { status: res.status, body, text };
}

function daysBetween(from, to) {
  const list = [];
  const end = Date.parse(to + 'T00:00:00Z');
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= end; t += 86400000) {
    list.push(new Date(t).toISOString().slice(0, 10));
  }
  return list;
}

const [mode, a, b, c, d] = process.argv.slice(2);
const { token } = await getToken();

if (mode === 'probe' && a) {
  const r = await signedUrls(token, [a]);
  const first = r.body && r.body.objectUrls && r.body.objectUrls[0];
  console.log('HTTP', r.status);
  console.log('top-level fields:', r.body ? Object.keys(r.body) : r.text.slice(0, 200));
  if (first) {
    console.log('first entry fields:', Object.keys(first));
  }
  process.exit(r.status === 200 ? 0 : 1);
}

if (mode !== 'days' || !a || !b || !c) {
  console.error('usage: probe <path> | days <prefix> <from> <to> [ext]');
  process.exit(2);
}

const ext = d || 'parquet';
const paths = daysBetween(b, c).map((day) => `${a}${day}.${ext}`);
const saved = [];
const failed = [];
for (let i = 0; i < paths.length; i += BATCH) {
  const part = paths.slice(i, i + BATCH);
  const r = await signedUrls(token, part);
  if (r.status !== 200 || !r.body || !r.body.objectUrls) {
    failed.push(...part.map((p) => `${p} (HTTP ${r.status})`));
    continue;
  }
  for (const item of r.body.objectUrls) {
    const file = await fetch(item.signedUrl);
    if (!file.ok) {
      failed.push(`${item.path} (download HTTP ${file.status})`);
      continue;
    }
    const target = resolve(OUT, item.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(await file.arrayBuffer()));
    saved.push(item.path);
  }
}

console.log(`downloaded ${saved.length} of ${paths.length} files`);
failed.forEach((f) => console.log('FAILED', f));
if (saved.length) {
  const name = a.replace(/[^A-Za-z0-9=_-]+/g, '_') + `${b}_${c}`;
  const zip = resolve(OUT, `datalake-${name}.zip`);
  execFileSync('zip', ['-q', '-r', zip, ...saved], { cwd: OUT });
  console.log('zip:', zip);
}
