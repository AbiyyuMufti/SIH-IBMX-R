// Checks a .drawio file made by scripts/build-drawio.js:
// unique ids, edges that point to existing cells, boxes that overlap,
// and boxes whose text probably does not fit (estimate by characters).
// Usage: node scripts/validate-drawio.js [file]
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'diagrams/powerbi-data-map.drawio';
const xml = readFileSync(file, 'utf8');
// Rough text size: pixels per character and per line at font size 11.
const CHAR_WIDTH = 6.1;
const LINE_HEIGHT = 15;
const PADDING_X = 16;
const PADDING_Y = 8;

const unescape = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

let problems = 0;
const fail = (msg) => {
  problems += 1;
  console.log(`  PROBLEM: ${msg}`);
};

for (const d of xml.matchAll(/<diagram name="([^"]*)"[\s\S]*?<\/diagram>/g)) {
  const page = d[0];
  const name = unescape(d[1]);
  const ids = new Set();
  const boxes = [];
  const edges = [];
  for (const c of page.matchAll(/<mxCell id="([^"]+)"([^>]*)>/g)) {
    if (ids.has(c[1])) {
      fail(`${name}: duplicate id ${c[1]}`);
    }
    ids.add(c[1]);
    const attrs = c[2];
    if (attrs.includes('edge="1"')) {
      edges.push({
        id: c[1],
        source: (attrs.match(/source="([^"]+)"/) || [])[1],
        target: (attrs.match(/target="([^"]+)"/) || [])[1],
      });
    } else if (attrs.includes('vertex="1"')) {
      const rest = page.slice(c.index, c.index + 6000);
      const g = rest.match(/<mxGeometry x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
      const value = unescape((attrs.match(/value="([^"]*)"/) || [, ''])[1]);
      const isText = /style="text;/.test(attrs);
      boxes.push({ id: c[1], x: +g[1], y: +g[2], w: +g[3], h: +g[4], value, isText });
    }
  }
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      fail(`${name}: edge ${e.id} points to a missing cell`);
    }
  }
  let overlaps = 0;
  let tooSmall = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i];
    if (!a.isText) {
      // Estimate the height the text needs.
      const lines = a.value
        .split(/<br\s*\/?>/)
        .map((part) => part.replace(/<[^>]+>/g, ''))
        .reduce((n, text) => n + Math.max(1, Math.ceil((text.length * CHAR_WIDTH) / (a.w - PADDING_X))), 0);
      const needed = lines * LINE_HEIGHT + PADDING_Y;
      if (needed > a.h + 4) {
        tooSmall += 1;
        if (tooSmall <= 3) {
          fail(`${name}: text may not fit (needs ~${needed}px, box ${a.h}px): ${a.value.replace(/<[^>]+>/g, ' ').slice(0, 70)}`);
        }
      }
    }
    for (let j = i + 1; j < boxes.length; j += 1) {
      const b = boxes[j];
      if (a.isText || b.isText) {
        continue;
      }
      // A box drawn inside another box on purpose (SIH source inside SIH integration).
      const inside = (p, q) => p.x >= q.x && p.y >= q.y && p.x + p.w <= q.x + q.w && p.y + p.h <= q.y + q.h;
      if (inside(a, b) || inside(b, a)) {
        continue;
      }
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        overlaps += 1;
        if (overlaps <= 3) {
          fail(`${name}: boxes overlap at (${a.x},${a.y}) and (${b.x},${b.y})`);
        }
      }
    }
  }
  console.log(`${name}: ${boxes.length} boxes, ${edges.length} arrows, ${overlaps} overlaps, ${tooSmall} text-fit warnings`);
}
console.log(problems === 0 ? 'RESULT: PASS' : `RESULT: ${problems} problem(s)`);
