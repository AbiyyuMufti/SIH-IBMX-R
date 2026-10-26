// One-time conversion of the Provideam Historical OEE archives (one row per
// machine and day, 2022 to Nov 2024) into the table Historical_OEE_EU.
// Local only: writes <out>/stage/Historical_OEE_EU/site=<Site>/*.json
// ({schema, rows}) and <out>/checks.txt; then
//   python -I scripts/helper-chartres-write-parquet.py <out>
// makes <out>/report/Historical_OEE_EU/site=<Site>/Historical_OEE_EU_archive.parquet
// and scripts/historical-oee-upload.js uploads them (docs/historical-oee.md).
// Usage: node scripts/historical-oee-convert.js <out> <Site>=<archive.csv> ...
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { historicalOeeSchema } from './lib-pbi-report-schemas.js';

const TABLE = 'Historical_OEE_EU';
const DATA_SOURCE = 'Provideam archive';
const [out, ...inputs] = process.argv.slice(2);
if (!out || !inputs.length || inputs.some((a) => !a.includes('='))) {
  console.error('usage: node scripts/historical-oee-convert.js <out> <Site>=<archive.csv> ...');
  process.exit(2);
}

// The Provideam exports: UTF-16 or UTF-8, tab separated, a trailing empty
// column and a "Total:" row at the end.
function readExport(path) {
  const raw = readFileSync(path);
  const utf16 = raw[0] === 0xff && raw[1] === 0xfe;
  const text = raw.toString(utf16 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== '');
  const head = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    return Object.fromEntries(head.map((name, i) => [name, cells[i] ?? '']));
  });
}

// "40.6%" -> 0.406 (rounded to 6 places against float noise); empty -> null.
function fraction(text) {
  const value = String(text).trim().replace('%', '');
  if (value === '' || isNaN(Number(value))) {
    return null;
  }
  return Math.round(Number(value) * 10000) / 1000000;
}

// Simple CSV of our own files (quoted fields allowed).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const head = (rows.shift() || []).map((h) => h.replace(/^\uFEFF/, ''));
  return rows.filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(head.map((h, k) => [h, r[k] ?? ''])));
}

// Machine Names of the site: the newest .csv of sharepoint/reference (local
// copy of the lake folder), unfiltered, as the report tables use it.
function machineLookup(site) {
  const dir = `sharepoint/reference/machine_names/site=${site}`;
  const files = readdirSync(dir).filter((f) => /\.csv$/i.test(f))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const lookup = {};
  parseCsv(readFileSync(files[0], 'utf8')).forEach((row) => {
    const name = (row.MachineName || '').trim();
    if (name) {
      lookup[name] = { Dept: row.Dept.trim(), Area: row.Area.trim(), 'Product Type': row['Product Type'].trim() };
    }
  });
  return { file: files[0], lookup };
}

// The rules of config/report_scope.csv for this table (none today: all true).
const scopeRows = parseCsv(readFileSync('config/report_scope.csv', 'utf8'));
function inEuReport(site, row) {
  const rules = scopeRows.filter((r) => r.Site === site &&
    r.Tables.split(';').map((t) => t.trim()).includes(TABLE));
  const keep = rules.filter((r) => r.Rule === 'keep');
  const columns = [...new Set(keep.map((r) => r.Column))];
  const kept = columns.every((c) => keep.some((r) => r.Column === c && r.Value.trim() === String(row[c] || '').trim()));
  const dropped = rules.some((r) => r.Rule === 'drop' && r.Value.trim() === String(row[r.Column] || '').trim());
  return kept && !dropped;
}

const dayNumber = (text) => Date.UTC(+text.slice(0, 4), +text.slice(5, 7) - 1, +text.slice(8, 10)) / 86400000;
const checks = [];
const loadedAt = Date.now();
for (const input of inputs) {
  const [site, path] = input.split('=');
  const raw = readExport(path);
  const { file, lookup } = machineLookup(site);
  const rows = [];
  let totalRows = 0;
  let badDate = 0;
  const noMachine = new Set();
  for (const r of raw) {
    const date = (r['YYYY-MM-DD'] || '').trim();
    if (date.startsWith('Total')) {
      totalRows++;
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      badDate++;
      continue;
    }
    const machine = r.MachineName;
    const info = lookup[machine.trim()];
    if (!info) {
      noMachine.add(machine);
    }
    const row = {
      Date: dayNumber(date),
      MachineName: machine,
      SiteName: site,
      'Unique Machine Name': `${machine}-${site}`,
      OEE: fraction(r.OEE),
      Availability: fraction(r.Availability),
      Performance: fraction(r.Performance),
      Dept: info ? info.Dept : null,
      Area: info ? info.Area : null,
      'Product Type': info ? info['Product Type'] : null,
      'Data Source': DATA_SOURCE,
      'In EU Report': true,
      loaded_at: loadedAt
    };
    row['In EU Report'] = inEuReport(site, row);
    rows.push(row);
  }
  const days = rows.map((r) => r.Date).sort((a, b) => a - b);
  const dayText = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  const avg = (name) => rows.reduce((s, r) => s + (r[name] ?? 0), 0) / rows.length;
  checks.push(`${site}: ${path}`);
  checks.push(`  raw rows ${raw.length} = kept ${rows.length} + Total row ${totalRows} + bad date ${badDate}: ` +
    (raw.length === rows.length + totalRows + badDate ? 'OK' : 'MISMATCH'));
  checks.push(`  days ${dayText(days[0])} to ${dayText(days[days.length - 1])}, ` +
    `${new Set(rows.map((r) => r.MachineName)).size} machines`);
  checks.push(`  simple averages: OEE ${avg('OEE').toFixed(4)}, Availability ${avg('Availability').toFixed(4)}, ` +
    `Performance ${avg('Performance').toFixed(4)}`);
  checks.push(`  machine lookup ${file}: ${noMachine.size} machine(s) not in it (empty Dept, Area, Product Type): ` +
    [...noMachine].slice(0, 15).join(' / '));
  const stage = join(out, 'stage', TABLE, `site=${site}`, `${TABLE}_archive.json`);
  mkdirSync(dirname(stage), { recursive: true });
  writeFileSync(stage, JSON.stringify({ schema: historicalOeeSchema, rows }));
}
writeFileSync(join(out, 'checks.txt'), checks.join('\n') + '\n');
console.log(checks.join('\n'));
