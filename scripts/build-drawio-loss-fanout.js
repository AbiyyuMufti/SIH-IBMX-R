// Builds diagrams/hull-loss-fanout.drawio: one page, two flows side by side,
// each top down. Left = Power BI as-is, right = with the fix.
// Example: Hull, SP8, 14 Sep 2026, CasePacker Carton Infeed.
// Usage: node scripts/build-drawio-loss-fanout.js
//        node scripts/validate-drawio.js diagrams/hull-loss-fanout.drawio
import { writeFileSync } from 'node:fs';

const OUTPUT = 'diagrams/hull-loss-fanout.drawio';
const COLOR = {
  source: ['#dae8fc', '#6c8ebf'],
  step: ['#f5f5f5', '#666666'],
  bad: ['#f8cecc', '#b85450'],
  good: ['#d5e8d4', '#82b366'],
  new: ['#fff2cc', '#d6b656'],
  head: ['#ffffff', '#ffffff'],
};
const W = 380;
const H = 80;
const STEP = 120;
const LEFT = 40;
const RIGHT = 520;
const TOP = 70;

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cells = [];
let n = 1;

function box(x, y, html, kind, h = H) {
  n += 1;
  const id = `lf${n}`;
  const [fill, stroke] = COLOR[kind];
  let style = 'whiteSpace=wrap;html=1;align=left;verticalAlign=middle;spacingLeft=8;';
  style += `spacingRight=6;fontSize=12;fillColor=${fill};strokeColor=${stroke};`;
  if (kind === 'head') {
    style += 'fontSize=16;fontStyle=1;';
  }
  cells.push(
    `<mxCell id="${id}" value="${esc(html)}" style="${style}" vertex="1" parent="1">` +
      `<mxGeometry x="${x}" y="${y}" width="${W}" height="${h}" as="geometry"/></mxCell>`,
  );
  return id;
}

function arrow(from, to) {
  n += 1;
  const style = 'html=1;endArrow=block;endFill=1;strokeWidth=2;strokeColor=#666666;';
  cells.push(
    `<mxCell id="lf${n}" style="${style}" edge="1" parent="1" source="${from}" target="${to}">` +
      '<mxGeometry relative="1" as="geometry"/></mxCell>',
  );
}

// One flow: a list of [text, kind] boxes from top to bottom.
function flow(x, title, steps) {
  let prev = box(x, 20, title, 'head', 40);
  steps.forEach(([text, kind], i) => {
    const id = box(x, TOP + i * STEP, text, kind);
    arrow(prev, id);
    prev = id;
  });
}

const KEY = 'Key = 14/09/2026 SP8 Unplanned Loss Breakdown CasePacker Carton Infeed';

const shared = [
  [
    '<b>1. Stops (raw file)</b><br>14:45 Mechanical 30 min<br>16:09 Electrical 96 min<br>= 2 stops, 126 min',
    'source',
  ],
  [
    '<b>2. Price list (raw file)</b><br>Electrical 96 min, 5,280 units<br>Mechanical 30 min, 1,650 units',
    'source',
  ],
  [
    '<b>3. Rename</b> Breakdown - Electrical / Mechanical to Breakdown (stops and price list)',
    'step',
  ],
  [`<b>4. Make the key</b> for stops and price lines<br>${KEY}<br>Both price lines get the SAME key`, 'bad'],
];

flow(LEFT, 'AS-IS (Power BI today)', [
  ...shared,
  ['<b>5. Join</b> stops to price list on key<br>every match = one row, key has 2 lines', 'bad'],
  ['<b>6. Result: 4 rows, 252 min</b><br>each stop twice, Count of Volume Key = 2<br>(truth: 2 rows, 126 min)', 'bad'],
]);

flow(RIGHT, 'TO-BE (with the fix)', [
  ...shared.slice(0, 3),
  [`<b>4. Make the key</b> (same as as-is)<br>${KEY}`, 'step'],
  [
    '<b>5. NEW: group price list by key</b><br>sum units, sum minutes<br>= 1 line: 126 min, 6,930 units',
    'new',
  ],
  ['<b>6. Join</b> stops to price list on key<br>key has 1 line = one row per stop', 'good'],
  ['<b>7. Result: 2 rows, 126 min</b><br>Count of Volume Key = 1<br>= truth', 'good'],
]);

let xml = '<mxfile host="app.diagrams.net"><diagram name="Loss fan-out" id="lossfanout">';
xml += '<mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" ';
xml += 'connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">';
xml += `<root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}`;
xml += '</root></mxGraphModel></diagram></mxfile>';
writeFileSync(OUTPUT, xml);
console.log(`wrote ${OUTPUT}`);
