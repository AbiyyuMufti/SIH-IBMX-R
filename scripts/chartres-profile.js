// Profiles one Chartres OEE .xlsm without running anything in it.
// Usage: node scripts/chartres-profile.js <file.xlsm> [json=<out.json>] [rows=<n>]
// Per sheet: state, size, input cells vs formula cells, formulas per column,
// first text rows (the French headers). Also: macro modules (names only),
// defined names, external links, tables, connections.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readZip } from './lib-office.js';

const HEAD_ROWS = 12;

const unesc = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
const colNum = (L) => [...L].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) {
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  }
  return s;
};

export function profileFile(file) {
  const zip = readZip(file);
  const text = (n) => (zip.read(n) ? zip.read(n).toString('utf8') : '');
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  );
  const rels = text('xl/_rels/workbook.xml.rels');
  const wb = text('xl/workbook.xml');

  const sheets = [];
  for (const m of wb.matchAll(/<sheet ([^>]*?)\/>/g)) {
    const name = unesc(m[1].match(/name="([^"]*)"/)[1]);
    const state = (m[1].match(/state="(\w+)"/) || [])[1] || 'visible';
    const rid = m[1].match(/r:id="([^"]+)"/)[1];
    const rel = rels.match(new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*>`))[0];
    const target = rel.match(/Target="([^"]+)"/)[1].replace(/^\/?(xl\/)?/, 'xl/');
    sheets.push({ name, state, target });
  }

  function profileSheet(sh) {
    const xml = text(sh.target);
    const dim = (xml.match(/<dimension ref="([^"]+)"/) || [])[1] || '';
    let input = 0;
    let formulas = 0;
    let sharedKids = 0;
    const perCol = new Map();
    const head = [];
    const masters = new Map();
    for (const row of xml.matchAll(/<row ([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rnum = Number(row[1].match(/r="(\d+)"/)[1]);
      const texts = [];
      for (const c of row[2].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = c[1].match(/r="([A-Z]+)(\d+)"/);
        const body = c[2] || '';
        const f = body.match(/<f([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/);
        const v = body.match(/<v>([\s\S]*?)<\/v>/);
        const t = (c[1].match(/t="(\w+)"/) || [])[1];
        if (f) {
          formulas += 1;
          let ftext = f[2] ? unesc(f[2]) : '';
          const si = (f[1].match(/si="(\d+)"/) || [])[1];
          if (ftext && si !== undefined) {
            masters.set(si, ftext);
          } else if (!ftext && si !== undefined) {
            sharedKids += 1;
            ftext = `=shared#${si}: ${masters.get(si) ?? '?'}`;
          }
          const list = perCol.get(ref[1]) ?? { n: 0, first: null, firstRow: 0 };
          list.n += 1;
          if (!list.first || list.first.startsWith('=shared#')) {
            list.first = ftext.startsWith('=shared#') ? ftext : ftext;
            list.firstRow = rnum;
          }
          perCol.set(ref[1], list);
        } else if (v || body.includes('<is>')) {
          input += 1;
        }
        if (rnum <= 400 && (t === 's' || t === 'inlineStr') && v) {
          const s = t === 's' ? shared[Number(v[1])] : '';
          if (s) {
            texts.push(`${ref[1]}${rnum}=${s.replace(/\s+/g, ' ').slice(0, 40)}`);
          }
        }
      }
      if (texts.length > 0 && head.length < HEAD_ROWS) {
        head.push(texts);
      }
    }
    const cols = [...perCol.entries()]
      .sort((a, b) => colNum(a[0]) - colNum(b[0]))
      .map(([c, o]) => ({ col: c, count: o.n, row: o.firstRow, formula: o.first }));
    return { name: sh.name, state: sh.state, dim, input, formulas, sharedKids, cols, head };
  }

  const profile = {
    file,
    macro: null,
    definedNames: [...wb.matchAll(/<definedName ([^>]*)>([\s\S]*?)<\/definedName>/g)].map((m) =>
      `${unesc(m[1].match(/name="([^"]+)"/)[1])} -> ${unesc(m[2])}`,
    ),
    externalLinks: zip.names.filter((n) => n.startsWith('xl/externalLinks/') && !n.includes('_rels')),
    tables: zip.names.filter((n) => n.startsWith('xl/tables/')),
    pivots: zip.names.filter((n) => n.startsWith('xl/pivotTables/') && !n.includes('_rels')),
    connections: zip.names.filter((n) => n.includes('connections') || n.startsWith('customXml/')),
    calcPr: (wb.match(/<calcPr[^>]*>/) || [''])[0],
    sheets: sheets.map(profileSheet),
  };

  const vba = zip.read('xl/vbaProject.bin');
  if (vba) {
    const s = vba.toString('latin1');
    const mods = [...s.matchAll(/(Module|Class|Document|BaseClass)=([^\r\n]+)/g)].map((m) => `${m[1]}=${m[2]}`);
    profile.macro = { bytes: vba.length, modules: [...new Set(mods)] };
  }

  return profile;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = (process.argv.find((a) => a.startsWith('json=')) ?? '').slice(5);
  const profile = profileFile(process.argv[2]);
  if (out) {
    writeFileSync(out, JSON.stringify(profile, null, 1));
  }
  console.log(JSON.stringify(profile, null, 1));
}
