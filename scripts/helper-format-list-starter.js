// Makes a Format List starter file for one site: every MachineName +
// PartName of the site's plan OPT and run rates month files (sharepoint/
// source, local) that the site's Format List file does not have yet, in the
// Format List layout with Brand, Unit Size, Unit Count/Format and Extra Info
// empty for the site to fill. Local only, nothing is uploaded.
// Usage: node scripts/helper-format-list-starter.js <Site>
//   writes sharepoint/format_list_starter_<Site>.csv
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const site = process.argv[2];
if (!site) {
  console.error('usage: node scripts/helper-format-list-starter.js <Site>');
  process.exit(2);
}
const root = new URL('../sharepoint/', import.meta.url);
// Weinheim part names start with an 8-character part code (cut in the report).
const PART_CUT = { Weinheim: 8 };

// Minimal CSV reader: quoted fields with commas and doubled quotes.
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

const filesOf = (dir) => (existsSync(dir) ? readdirSync(dir).map((f) => new URL(f, dir)) : []);
const sourceFiles = ['plan_opt', 'run_rates']
  .flatMap((type) => filesOf(new URL(`source/${type}/site=${site}/`, root)));
const formatFiles = filesOf(new URL(`reference/format_list/site=${site}/`, root));

const known = new Set();
for (const file of formatFiles) {
  for (const row of parseCsv(readFileSync(file, 'utf8'))) {
    known.add(`${row.MachineName.trim()}|${row['Product Name'].trim()}`);
  }
}

// MachineName + PartName -> row count, as the report keys them.
const seen = new Map();
for (const file of sourceFiles) {
  for (const row of parseCsv(readFileSync(file, 'utf8'))) {
    const machine = row.MachineName || '';
    let part = row.PartName || '';
    if (PART_CUT[site]) {
      part = part.slice(PART_CUT[site]);
    }
    part = part.replace(/\s+$/, '');
    if (!machine || !part) {
      continue;
    }
    const key = `${machine.trim()}|${part.trim()}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
}

const quote = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const missing = [...seen.keys()].filter((key) => !known.has(key)).sort();
const lines = ['Site Name,MachineName,Product Name,Brand,Unit Size,Unit Count/Format,Extra Info'];
for (const key of missing) {
  const [machine, part] = key.split('|');
  lines.push([site, machine, part, '', '', '', ''].map(quote).join(','));
}
const out = new URL(`format_list_starter_${site}.csv`, root);
writeFileSync(out, lines.join('\n') + '\n');
console.log(`${site}: ${sourceFiles.length} month files, ${seen.size} machine + part pairs, ` +
  `${known.size} in the Format List file, ${missing.length} missing -> ${out.pathname}`);
