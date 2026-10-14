// Lists and downloads data lake files (run it on your own computer, it needs .env).
// Paths are WITHOUT the "data/ten=<tenant>/" prefix that the list shows,
// for example mufti_test/fact_loss/fact_loss_2026-10-12.parquet.
// Usage: node scripts/datalake-download.js list <folder/>
//        node scripts/datalake-download.js get <path>
//        node scripts/datalake-download.js days <prefix> <from> <to> [ext]
//   list = files in a folder (name, size, last change), no download
//   get  = one file into downloads/<path>
//   days = <prefix>YYYY-MM-DD.<ext> for every day, one request per file, then a zip
// Download = POST generateDownloadObjectUrls (exactly 1 path, answer 201),
// then GET of the signed URL. Signed URLs and tokens are never printed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { getToken } from './lib-ih.js';
import { listObjects, downloadOne } from './lib-datalake.js';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'downloads');
const PREFIX = /^data\/ten=[^/]+\//;

// The list shows keys with a prefix, the API wants the path without it.
function cleanPath(path) {
  return path.replace(PREFIX, '');
}

// zip is not installed everywhere (not in Git Bash on Windows).
// Fallback: the tar.exe that ships with Windows 10 can write zip files.
function makeZip(zipFile, files) {
  try {
    execFileSync('zip', ['-q', '-r', zipFile, ...files], { cwd: OUT });
    return;
  } catch (e) {
    if (e.code !== 'ENOENT' || process.platform !== 'win32') {
      throw e;
    }
  }
  const tar = resolve(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['-a', '-c', '-f', zipFile, ...files], { cwd: OUT });
}

function daysBetween(from, to) {
  const list = [];
  const end = Date.parse(to + 'T00:00:00Z');
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= end; t += 86400000) {
    list.push(new Date(t).toISOString().slice(0, 10));
  }
  return list;
}

function save(path, bytes) {
  const target = resolve(OUT, path);
  if (!target.startsWith(OUT + sep)) {
    return false;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return true;
}

async function main() {
  const [mode, a, b, c, d] = process.argv.slice(2);
  const { token } = await getToken();

  if (mode === 'list' && a) {
    let next;
    let total = 0;
    do {
      const r = await listObjects(token, a, next);
      if (r.status !== 200) {
        console.log(`HTTP ${r.status}`, JSON.stringify(r.body).slice(0, 300));
        process.exit(1);
      }
      const objects = r.body.objects || { files: [], folders: [] };
      objects.folders.forEach((f) => console.log('folder', f.key));
      objects.files.forEach((f) => {
        console.log(`${f.lastModified}  ${String(f.contentSize).padStart(10)}  ${f.key}`);
      });
      total += objects.files.length;
      next = r.body.isTruncated === 'true' || r.body.isTruncated === true
        ? r.body.page && r.body.page.nextToken
        : null;
    } while (next);
    console.log(`${total} file(s)`);
    return;
  }

  if (mode === 'get' && a) {
    const path = cleanPath(a);
    const r = await downloadOne(token, path);
    if (!r.ok) {
      console.log('FAILED', path, r.why);
      process.exit(1);
    }
    if (!save(path, r.bytes)) {
      console.log('FAILED', path, 'path leaves the downloads folder');
      process.exit(1);
    }
    console.log(`saved downloads/${path} (${r.bytes.length} bytes)`);
    return;
  }

  if (mode !== 'days' || !a || !b || !c) {
    console.error('usage: list <folder/> | get <path> | days <prefix> <from> <to> [ext]');
    process.exit(2);
  }

  const ext = d || 'parquet';
  const paths = daysBetween(b, c).map((day) => `${cleanPath(a)}${day}.${ext}`);
  const saved = [];
  const failed = [];
  for (const path of paths) {
    const r = await downloadOne(token, path);
    if (r.ok && save(path, r.bytes)) {
      saved.push(path);
    } else {
      failed.push(`${path} (${r.ok ? 'path leaves the downloads folder' : r.why})`);
    }
  }
  console.log(`downloaded ${saved.length} of ${paths.length} files`);
  failed.forEach((f) => console.log('FAILED', f));
  if (saved.length) {
    const name = cleanPath(a).replace(/[^A-Za-z0-9=_-]+/g, '_') + `${b}_${c}`;
    const zip = resolve(OUT, `datalake-${name}.zip`);
    makeZip(zip, saved);
    console.log('zip:', zip);
  }
}

main();
