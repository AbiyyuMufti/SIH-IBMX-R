// Compares the extracted Chartres OEE files: sheets, main-sheet columns, macros.
// Usage: node scripts/chartres-compare.js <extractFolder> [json=<out.json>]
// Reads only (profileFile), never opens a workbook in Excel.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { profileFile } from './chartres-profile.js';

const root = process.argv[2];
const out = (process.argv.find((a) => a.startsWith('json=')) ?? '').slice(5);

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    files.push(...(statSync(p).isDirectory() ? walk(p) : [p]));
  }
  return files;
}

// Texts of the first text row of a sheet, as { column letter: text }.
const headerOf = (sheet) =>
  Object.fromEntries(
    (sheet?.head[0] ?? []).map((t) => {
      const m = t.match(/^([A-Z]+)\d+=(.*)$/);
      return [m[1], m[2]];
    }),
  );

const rows = [];
for (const path of walk(root).filter((p) => /[\\/]\d{4}[\\/]SAISIE OEE[\\/]OEE[^\\/]*\.xlsm$/i.test(p))) {
  const rel = relative(root, path).replace(/\\/g, '/');
  const p = profileFile(path);
  const main = p.sheets.find((s) => s.name === 'Base') ?? p.sheets[0];
  rows.push({
    rel,
    sheets: p.sheets.map((s) => `${s.name}${s.state === 'visible' ? '' : s.state === 'hidden' ? '*' : '**'}`),
    main: main.name,
    mainDim: main.dim,
    mainInput: main.input,
    mainFormulas: main.formulas,
    header: headerOf(main),
    planOpt: headerOf(p.sheets.find((s) => s.name === 'PlanOPT')),
    lineLosses: headerOf(p.sheets.find((s) => s.name === 'LineLosses')),
    modules: (p.macro?.modules ?? []).filter((m) => m.startsWith('Module=')),
    tables: p.tables.length,
    links: p.externalLinks.length,
    sheetStats: p.sheets.map((s) => [s.name, s.state, s.dim, s.input, s.formulas]),
  });
}
if (out) {
  writeFileSync(out, JSON.stringify(rows, null, 1));
}
console.log(`${rows.length} files profiled`);
