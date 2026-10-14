// Read-only readers for Office and Power BI files, no dependencies.
// readXlsx: sheets as arrays of rows. readPbitModel: tables, columns, relationships.
// readPbixUsage: which pages of a report use which table columns and measures.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

// Minimal zip reader (central directory, stored or deflate entries).
export function readZip(path) {
  const buf = readFileSync(path);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) {
    eocd -= 1;
  }
  if (eocd < 0) {
    throw new Error(`Not a zip file: ${path}`);
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

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

// Reads every sheet of an .xlsx. Returns { sheetName: [[cell, ...], ...] }.
// maxRows limits the rows per sheet (the large sample files).
export function readXlsx(path, maxRows = Infinity) {
  const zip = readZip(path);
  const text = (name) => (zip.read(name) ? zip.read(name).toString('utf8') : '');
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unescapeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  );
  const rels = text('xl/_rels/workbook.xml.rels');
  const result = {};
  for (const [, name, rid] of text('xl/workbook.xml').matchAll(
    /<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g,
  )) {
    const rel = rels.match(new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*>`))[0];
    const target = rel.match(/Target="([^"]+)"/)[1].replace(/^\/?(xl\/)?/, 'xl/');
    const xml = text(target);
    const rows = [];
    for (const row of xml.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= maxRows) {
        break;
      }
      const cells = [];
      for (const c of row[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = (c[1].match(/r="([A-Z]+)\d+"/) || [])[1];
        const col = [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const type = (c[1].match(/t="(\w+)"/) || [])[1];
        const v = (c[2] || '').match(/<v>([\s\S]*?)<\/v>/);
        const inline = (c[2] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/);
        let value = '';
        if (type === 's' && v) {
          value = shared[Number(v[1])];
        } else if (v) {
          value = unescapeXml(v[1]);
        } else if (inline) {
          value = unescapeXml(inline[1]);
        }
        cells[col] = value;
      }
      rows.push(Array.from(cells, (x) => x ?? ''));
    }
    result[unescapeXml(name)] = rows;
  }
  return result;
}

// Power BI writes UTF-16 little endian without a BOM.
function decode(buf) {
  const t = buf[1] === 0 ? buf.toString('utf16le') : buf.toString('utf8');
  return t.replace(/^﻿/, '');
}

// Reads the model of a .pbit: { tables: [{name, columns, measures}], relationships }.
export function readPbitModel(path) {
  const raw = readZip(path).read('DataModelSchema');
  if (!raw) {
    throw new Error('No DataModelSchema: use a .pbit export');
  }
  const model = JSON.parse(decode(raw)).model;
  const tables = model.tables
    .filter((t) => !t.name.startsWith('LocalDateTable') && !t.name.startsWith('DateTableTemplate'))
    .map((t) => ({
      name: t.name,
      hidden: !!t.isHidden,
      query: (() => {
        const e = t.partitions?.[0]?.source?.expression;
        return Array.isArray(e) ? e.join('\n') : e || '';
      })(),
      columns: (t.columns ?? []).map((c) => ({
        name: c.name,
        type: c.dataType,
        calculated: c.type === 'calculated',
        expression: Array.isArray(c.expression) ? c.expression.join(' ') : c.expression,
      })),
      measures: (t.measures ?? []).map((m) => ({
        name: m.name,
        expression: Array.isArray(m.expression) ? m.expression.join('\n') : String(m.expression),
      })),
    }));
  return { tables, relationships: model.relationships };
}

// Reads a .pbix: page names and, per table, the pages that use it.
export function readPbixUsage(path) {
  const zip = readZip(path);
  const pageNames = {};
  const pageOrder = [];
  for (const n of zip.names) {
    const m = n.match(/^Report\/definition\/pages\/(\w+)\/page\.json$/);
    if (m) {
      pageNames[m[1]] = JSON.parse(zip.read(n).toString('utf8')).displayName;
    }
  }
  const order = zip.read('Report/definition/pages/pages.json');
  if (order) {
    for (const id of JSON.parse(order.toString('utf8')).pageOrder) {
      pageOrder.push(pageNames[id]);
    }
  }
  const field = /"(Column|Measure)":\{"Expression":\{"SourceRef":\{"Entity":"([^"]+)"\}\},"Property":"([^"]+)"/g;
  const tablePages = new Map();
  const columnPages = new Map();
  for (const n of zip.names) {
    const m = n.match(/^Report\/definition\/pages\/(\w+)\/visuals\/\w+\/visual\.json$/);
    if (!m) {
      continue;
    }
    for (const f of zip.read(n).toString('utf8').matchAll(field)) {
      const page = pageNames[m[1]];
      const table = tablePages.get(f[2]) ?? new Set();
      table.add(page);
      tablePages.set(f[2], table);
      const key = `${f[2]}|${f[3]}`;
      const col = columnPages.get(key) ?? new Set();
      col.add(page);
      columnPages.set(key, col);
    }
  }
  return { pageOrder, tablePages, columnPages };
}
