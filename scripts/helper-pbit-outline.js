// Read-only, no network. Outlines a Power BI template (.pbit) or report (.pbix).
// The .pbit has the model without data: tables, columns, relationships,
// measures and the load queries. The .pbix also has the report pages.
// URLs in queries are replaced by <URL>. Nothing is written to disk.
// Usage:
//   node scripts/helper-pbit-outline.js file.pbit
//   node scripts/helper-pbit-outline.js file.pbit --table "Plan OPT EU"
//   node scripts/helper-pbit-outline.js file.pbit --measures [text]
//   node scripts/helper-pbit-outline.js file.pbix --report
// Keep the files outside the repo: they hold customer names and paths.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const file = process.argv[2];
const args = process.argv.slice(3);
const flag = (name) => args.indexOf(name);

if (!file) {
  console.log('Usage: node scripts/helper-pbit-outline.js <file.pbit|pbix> [options]');
  process.exit(1);
}

// Minimal zip reader (central directory, stored or deflate entries).
function readZip(path) {
  const buf = readFileSync(path);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) {
    eocd -= 1;
  }
  if (eocd < 0) {
    throw new Error('Not a zip file');
  }
  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    const method = buf.readUInt16LE(pos + 10);
    const size = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const local = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    entries.set(name, { method, size, local });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  const read = (name) => {
    const e = entries.get(name);
    if (!e) {
      return null;
    }
    const nLen = buf.readUInt16LE(e.local + 26);
    const xLen = buf.readUInt16LE(e.local + 28);
    const start = e.local + 30 + nLen + xLen;
    const raw = buf.subarray(start, start + e.size);
    return e.method === 8 ? inflateRawSync(raw) : raw;
  };
  return { names: [...entries.keys()], read };
}

// Power BI writes UTF-16 little endian without a BOM.
function text(buf) {
  const t = buf[1] === 0 ? buf.toString('utf16le') : buf.toString('utf8');
  return t.replace(/^﻿/, '');
}

const redact = (s) => String(s).replace(/https?:\/\/[^"\s)]+/g, '<URL>');
const lines = (e) => (Array.isArray(e) ? e.join('\n') : String(e ?? ''));
const zip = readZip(file);

// Report pages: which columns and measures each page uses.
if (flag('--report') >= 0) {
  const pages = {};
  const used = new Map();
  for (const n of zip.names) {
    const p = n.match(/^Report\/definition\/pages\/(\w+)\/page\.json$/);
    if (p) {
      pages[p[1]] = JSON.parse(zip.read(n).toString('utf8')).displayName;
    }
  }
  const field = /"(Column|Measure)":\{"Expression":\{"SourceRef":\{"Entity":"([^"]+)"\}\},"Property":"([^"]+)"/g;
  for (const n of zip.names) {
    const m = n.match(/^Report\/definition\/pages\/(\w+)\/visuals\/\w+\/visual\.json$/);
    if (!m) {
      continue;
    }
    for (const f of zip.read(n).toString('utf8').matchAll(field)) {
      const key = `${f[1]} | ${f[2]} | ${f[3]}`;
      const set = used.get(key) ?? new Set();
      set.add(pages[m[1]]);
      used.set(key, set);
    }
  }
  console.log(`Pages: ${Object.values(pages).join(', ')}`);
  for (const [key, set] of [...used].sort()) {
    console.log(`${key}  (${set.size} pages)`);
  }
  process.exit(0);
}

const raw = zip.read('DataModelSchema');
if (!raw) {
  console.log('No DataModelSchema in this file (a .pbix keeps the model compressed).');
  console.log('Use a .pbit export, or --report for the report pages.');
  process.exit(1);
}
const model = JSON.parse(text(raw)).model;
const tables = model.tables.filter((t) => !t.name.startsWith('LocalDateTable'));
const partitionOf = (t) => redact(lines(t.partitions?.[0]?.source?.expression));

const tIdx = flag('--table');
if (tIdx >= 0) {
  const t = model.tables.find((x) => x.name === args[tIdx + 1]);
  if (!t) {
    console.log('Table not found');
    process.exit(1);
  }
  console.log(`## ${t.name}`);
  for (const c of t.columns ?? []) {
    const calc = c.type === 'calculated' ? ` = ${lines(c.expression)}` : '';
    console.log(`  ${c.name} | ${c.dataType}${calc}`);
  }
  console.log('Load query:');
  console.log(partitionOf(t));
  process.exit(0);
}

const mIdx = flag('--measures');
if (mIdx >= 0) {
  const find = args[mIdx + 1];
  for (const t of model.tables) {
    for (const m of t.measures ?? []) {
      const dax = lines(m.expression);
      if (!find || m.name.includes(find) || dax.includes(find)) {
        console.log(`## ${t.name} / ${m.name}\n${dax}\n`);
      }
    }
  }
  process.exit(0);
}

// Default: tables, relationships, feeding queries.
console.log(`${model.tables.length} tables, ${model.relationships.length} relationships\n`);
console.log('TABLES (columns, measures, queries it appends or joins)');
for (const t of tables) {
  const refs = [...partitionOf(t).matchAll(/#"([^"]+)"/g)].map((m) => m[1]);
  const tableNames = new Set(model.tables.map((x) => x.name));
  const uniq = [...new Set(refs)].filter((r) => tableNames.has(r));
  const names = (t.columns ?? []).length;
  const meas = (t.measures ?? []).length;
  const from = uniq.length > 0 ? ` <- ${uniq.slice(0, 6).join(', ')}` : '';
  console.log(`  ${t.name}: ${names} columns, ${meas} measures${from}`);
}
console.log('\nRELATIONSHIPS (many side -> one side)');
for (const r of model.relationships) {
  if (r.fromTable.startsWith('LocalDateTable') || r.toTable.startsWith('LocalDateTable')) {
    continue;
  }
  const off = r.isActive === false ? ' INACTIVE' : '';
  console.log(`  ${r.fromTable}[${r.fromColumn}] -> ${r.toTable}[${r.toColumn}]${off}`);
}
