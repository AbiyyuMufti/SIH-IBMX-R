// Shared helpers of the VFC flow generators: type names, the function
// code reader, the tab builder (nodes on a 20 px grid, link nodes) and the
// lane steps. Used by build-vfc-reference-flows.js and build-vfc-site-flows.js.
import { readFileSync } from 'node:fs';

// Windows checkouts may have CRLF line endings: the flow always gets LF.
export const code = (file) => readFileSync(new URL(`./vfc/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Types as saved by the VFC: UTF8 (shown as STRING), BOOLEAN, INT64, DOUBLE,
// TIMESTAMP_MILLIS. There is no DATE type.
export const S = 'UTF8';
export const B = 'BOOLEAN';
export const I = 'INT64';
export const D = 'DOUBLE';
export const TS = 'TIMESTAMP_MILLIS';

// ---------- layout ----------
const COL_WIDTH = 260;
const FIRST_COL = 120;
const ROW_STEP = 220;
const FIRST_ROW = 120;

export function makeBuilder(flowIndex) {
  let counter = flowIndex * 1000;
  const newId = () => {
    counter++;
    const a = (0x10000 + counter * 7919).toString(16).slice(-5);
    const b = (0xa0000 + counter * 104729).toString(16).slice(-6);
    return `${a}.${b}`;
  };
  const TAB = newId();
  const nodes = [];
  const add = (node) => nodes.push({ z: TAB, ...node });
  const ids = {};
  const id = (key) => {
    ids[key] = ids[key] || newId();
    return ids[key];
  };
  const col = (c) => FIRST_COL + c * COL_WIDTH;
  const rowY = (r) => FIRST_ROW + (r - 1) * ROW_STEP;

  // Link nodes: one link in per key, any number of link outs per key.
  const linkInIds = {};
  const linkOutsOf = {};
  const linkOut = (key, x, y) => {
    linkInIds[key] = linkInIds[key] || newId();
    linkOutsOf[key] = linkOutsOf[key] || [];
    const outId = newId();
    linkOutsOf[key].push(outId);
    add({ id: outId, type: 'link out', name: `to ${key}`, mode: 'link', links: [linkInIds[key]], x, y, wires: [] });
    return outId;
  };
  const linkIn = (key, c, r, next) => {
    linkInIds[key] = linkInIds[key] || newId();
    linkOutsOf[key] = linkOutsOf[key] || [];
    add({
      id: linkInIds[key], type: 'link in', name: key, links: linkOutsOf[key],
      x: col(c), y: rowY(r), wires: [[next]]
    });
  };
  const comment = (name, info, r) =>
    add({ id: newId(), type: 'comment', name, info, x: 120, y: rowY(r) - 80, wires: [] });

  let stageNo = 0;

  // Places the steps of one lane. A function node is named
  // "<stage>.<number> <name>". Outputs: 'next' = the next node, any other
  // word = a link out "to <WORD>" (placed by the fork rule, see fanForks).
  function lane(r, title, info, steps) {
    stageNo++;
    comment(`[${stageNo}] ${title}`, `STAGE ${stageNo} - ${info}`, r);
    let fnNo = 0;
    // A step with stack: true shares the column of the step before it.
    const colOf = [];
    let colNo = -1;
    steps.forEach((s, i) => {
      if (!s.stack) colNo++;
      colOf[i] = colNo;
    });
    steps.forEach((step, i) => {
      const c = colOf[i];
      const nextStep = steps.slice(i + 1).find((s) => !s.stack);
      let nextId = null;
      if (nextStep && nextStep.t === 'end') {
        nextId = linkOut(nextStep.key, col(c + 1), rowY(r) + (step.dy || 0));
      } else if (nextStep) {
        nextId = id(nextStep.key);
      }
      // Side link outs sit below their node, one more row of 40 px each.
      const wiresFor = (outs, fan) => {
        let side = 0;
        return outs.map((o, k) => {
          if (o === 'next') return [nextId];
          if (fan) return [linkOut(o, col(c + 1), rowY(r) + (k - (outs.length - 1) / 2) * 40)];
          return [linkOut(o, col(c) + 120, rowY(r) + 60 + 40 * side++)];
        });
      };
      const pos = { x: col(c), y: rowY(r) + (step.dy || 0) };
      if (step.t === 'linkin') {
        linkIn(step.key, c, r, nextId);
      } else if (step.t === 'fn') {
        fnNo++;
        let func = code(step.file);
        for (const [from, to] of Object.entries(step.replace || {})) {
          func = func.replaceAll(from, to);
        }
        const fnId = id(step.key);
        const wires = wiresFor(step.outs, step.fan);
        if (step.also) wires[0].push(id(step.also));
        add({
          id: fnId, type: 'function', name: `${stageNo}.${fnNo} ${step.name}`,
          func, outputs: step.outs.length, language: 'javascript', noerr: 0, ...pos,
          wires
        });
      } else if (step.t === 'http') {
        add({
          id: id(step.key), type: 'http request', name: step.name, method: 'use', ret: 'obj',
          url: '', timeout: '', mindspherePath: '', useMindsphereAuth: false, isAdmin: false,
          ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'split') {
        add({
          id: id(step.key), type: 'split', name: 'Split per item', splt: '\\n', spltType: 'str',
          arraySplt: 1, arraySpltType: 'len', stream: false, addname: 'index', ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'delay') {
        add({
          id: id(step.key), type: 'delay', name: step.name, pauseType: 'rate',
          timeout: '1', timeoutUnits: 'seconds', rate: '1', nbRateUnits: String(step.seconds || 1),
          rateUnits: 'second',
          randomFirst: '1', randomLast: '1', randomUnits: 'seconds', drop: false,
          powerMode: false, ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'wait') {
        add({
          id: id(step.key), type: 'delay', name: step.name, pauseType: 'delay',
          timeout: String(step.seconds), timeoutUnits: 'seconds', rate: '1',
          nbRateUnits: '1', rateUnits: 'second', randomFirst: '1',
          randomLast: '5', randomUnits: 'seconds', drop: false,
          powerMode: false, ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'joinTimeout') {
        add({
          id: id(step.key), type: 'join', name: step.name, mode: 'custom', build: 'array',
          property: 'payload', propertyType: 'msg', key: 'topic', joiner: '\\n', joinerType: 'str',
          accumulate: false, useparts: false, timeout: String(step.seconds), count: '',
          reduceRight: false, reduceExp: '', reduceInit: '', reduceInitType: '', reduceFixup: '',
          ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'catch') {
        add({
          id: id(step.key), type: 'catch', name: step.name, scope: null, uncaught: false,
          ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'read') {
        add({
          id: id(step.key), type: 'read object', name: step.name, path: '', mode: 'object',
          ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'debug' && step.name) {
        add({
          id: id(step.key), type: 'debug', name: step.name, active: true, tosidebar: true,
          console: false, tostatus: false, complete: step.complete || 'payload',
          targetType: 'msg', ...pos, wires: []
        });
      } else if (step.t === 'join') {
        add({
          id: id(step.key), type: 'join', name: step.name, mode: 'auto', build: 'array',
          property: 'payload', propertyType: 'msg', key: 'topic', joiner: '\\n', joinerType: 'str',
          accumulate: false, timeout: '', count: '', ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'parquet') {
        add({
          id: id(step.key), type: 'parquet', name: `Write ${step.table} parquet`, option: 'write',
          columns: step.schema.map(([column, type]) => ({ column, type })), rcolumns: '',
          multi: 'multiple', outputPty: 'payload', outputPtyType: 'msg', engine: 'parquetjs',
          ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'pqread') {
        add({
          id: id(step.key), type: 'parquet', name: step.name, option: 'read',
          columns: [], rcolumns: '', multi: 'multiple', outputPty: 'payload',
          outputPtyType: 'msg', engine: 'hyparquet', ...pos, wires: [[nextId]]
        });
      } else if (step.t === 'raw') {
        add({
          id: id(step.key), ...step.node, ...pos,
          wires: nextId ? [[nextId]] : []
        });
      } else if (step.t === 'write') {
        add({
          id: id(step.key), type: 'write object',
          name: step.name || `${step.table} to data lake`, path: '',
          mode: 'object', ...pos, wires: []
        });
      }
    });
  }
  return { nodes, TAB, add, newId, id, col, rowY, comment, lane, linkOut, nextStage: () => ++stageNo };
}

// ---------- step helpers ----------
export const fn = (key, name, file, outs, replace = {}, fan = false, also = null) => ({
  t: 'fn', key, name, file, outs, replace, fan, also
});
export const http = (key, name) => ({ t: 'http', key, name });
export const linkInStep = (key) => ({ t: 'linkin', key });
export const end = (key) => ({ t: 'end', key });
export const split = (key) => ({ t: 'split', key });
export const delay = (key, name, seconds) => ({ t: 'delay', key, name, seconds });
export const join = (key, name) => ({ t: 'join', key, name });

export const catchStep = (key, name) => ({ t: 'catch', key, name });
export const readStep = (key, name) => ({ t: 'read', key, name });
export const waitStep = (key, name, seconds, stack = false, dy = 0) => ({
  t: 'wait', key, name, seconds, stack, dy
});
export const joinTimeout = (key, name, seconds) => ({ t: 'joinTimeout', key, name, seconds });
export const debugStep = (key, name, complete, stack = false, dy = 0) => ({
  t: 'debug', key, name, complete, stack, dy
});
export const pqRead = (key, name) => ({ t: 'pqread', key, name });
export const rawStep = (key, node) => ({ t: 'raw', key, node });
export const writeStep = (key, name) => ({ t: 'write', key, name });

// The three log lanes every flow tab ends with. Errors caught anywhere in
// the tab and all log lines go to one CSV file per month in the data lake:
// <root>/logs/<flow name>/log_YYYY-MM.csv. Returns the next free row.
export function addLogLanes(b, r, flowName) {
  const replace = { __FLOW__: flowName };
  b.lane(r++, 'ERRORS',
    'a catch node takes every error raised by a node of this tab and turns it into a log line with the name of the node and the message of the API (for example the limit message of evaluateKPIs). Errors of the log nodes themselves are not logged again.',
    [
      catchStep('errCatch', 'Catch errors'),
      fn('errFn', 'Describe error', 'l1-describe-error.js', ['next']),
      end('LOG')
    ]);
  b.lane(r++, 'LOG',
    'every log line arrives here through the link "to LOG". 1 turns a line into a row (time, flow, site, production day, level) and shows it in the debug sidebar. The join collects the rows for 30 s, the delay lets one batch pass every 10 s so two writes do not overlap, 3 sets the file of the month and the read node loads the old file. A read of a file that does not exist answers nothing (only a warning), so the same batch also goes through a 10 s wait to the append step. The log is written whatever the dry-run switch says.',
    [
      linkInStep('LOG'),
      fn('logFmt', 'Format log line', 'l2-format-line.js', ['next'], replace, false, 'logDebug'),
      joinTimeout('logJoin', 'Collect log lines', 30),
      debugStep('logDebug', 'Run log', 'line', true, 80),
      delay('logDelay', 'One log batch per 10 s', 10),
      fn('logBuild', 'Build log write', 'l3-build-log-write.js', ['next'], replace, false, 'logWait'),
      readStep('logRead', 'Read log file'),
      waitStep('logWait', 'Wait for read 10 s', 10, true, 80),
      end('APPEND')
    ]);
  b.lane(r++, 'LOG WRITE',
    'adds the rows of the batch to the old file and writes the whole file back (the data lake has no append). Columns: ts_utc, seq, flow, site, production_day, mode, level, source, message. Every field is quoted, line breaks become a space. The batch arrives twice (read answer and the wait) and is written once. If the read gives no answer for a file this flow wrote before, a new file with a time stamp is written, so the history is never replaced.',
    [
      linkInStep('APPEND'),
      fn('logAppend', 'Append log rows', 'l4-append-log.js', ['next']),
      writeStep('logWrite', 'Log to data lake')
    ]);
  return r;
}

// ---------- saved layout ----------
// Node ids can shift when a node is added, so a saved layout is keyed by
// type, name and the order of nodes with the same type and name.
export function layoutKeys(nodes) {
  const seen = {};
  const keys = new Map();
  nodes.forEach((node) => {
    if (typeof node.x !== 'number') {
      return;
    }
    const base = `${node.type}|${node.name || ''}`;
    seen[base] = (seen[base] || 0) + 1;
    keys.set(node, `${base}|${seen[base]}`);
  });
  return keys;
}

// Moves nodes to the positions in a layout object { key: [x, y] }.
// Nodes without a saved position keep the generated one.
export function applyLayout(nodes, layout) {
  let moved = 0;
  layoutKeys(nodes).forEach((key, node) => {
    const pos = layout[key];
    if (pos) {
      node.x = pos[0];
      node.y = pos[1];
      moved++;
    }
  });
  return moved;
}


// ---------- compact lanes ----------
// The generated flows put nodes on a fixed 260 px column grid. That leaves
// wide gaps next to short names and touching nodes next to long ones.
// compactLanes() keeps every row (y) and the order of the nodes, and moves
// each node to the right of the node that feeds it, `gap` px apart.

// Width of a node in the editor, estimated from its name: about 7 px per
// character plus the icon, rounded up to the 20 px grid, at least 100 px.
// Link nodes are 30 px wide (their label sits outside). Good to about 20 px:
// checked on a layout made by hand in the editor (0 overlaps, gaps 20 to 30).
export function nodeWidth(node) {
  if (node.type === 'link in' || node.type === 'link out') {
    return 30;
  }
  const label = node.name || node.type || '';
  return Math.max(100, 20 * Math.ceil((label.length * 7 + 57) / 20));
}

// Two nodes are in the same row when their centres are less than this apart.
const SAME_ROW_PX = 40;

// The layout rule of the generated flows (see CLAUDE.md):
// - LAYOUT_GAP px between two nodes of a row;
// - the first node of a lane (comment, inject, link in, catch: nothing is
//   wired to it) starts with its left edge LAYOUT_START_LEFT px from the left
//   border, which is 2 tiles of 20 px.
export const LAYOUT_GAP = 20;
export const LAYOUT_START_LEFT = 40;

// Fork rule (the layout the user made by hand in the VFC editor, checked on
// the Hull Power BI daily flow: 114 of 120 rows equal). A wire that splits
// is drawn as a fork:
// - a node with several wires out (several outputs, or one output with
//   several targets) puts its targets FORK_SPACING px apart, centred on the
//   node: 2 targets at -20 and +20, 3 at -40, 0, +40, 4 at -60, -20, +20, +60.
//   An output without a wire keeps its slot;
// - a node with one wire out puts its target back on the row of the lane
//   (a link out takes the row of its feeder);
// - nodes with no feeder (inject, backfill) that feed the same node stack
//   FORK_SPACING px apart, centred on that node.
// Rows are set from left to right, so a target is placed after its source.
export const FORK_SPACING = 40;

export function fanForks(nodes) {
  const placed = nodes.filter((n) => typeof n.x === 'number' && n.type !== 'tab');
  const byId = new Map(placed.map((n) => [n.id, n]));
  const feeders = new Map(placed.map((n) => [n.id, []]));
  placed.forEach((a) => {
    (a.wires || []).forEach((out) => {
      out.forEach((id) => {
        if (feeders.has(id)) {
          feeders.get(id).push(a);
        }
      });
    });
  });
  // Row of the lane: the y the builder gave. A link out takes the row of its feeder.
  const rowOf = new Map();
  const laneRow = (n) => {
    if (!rowOf.has(n.id)) {
      const from = feeders.get(n.id)[0];
      rowOf.set(n.id, n.type === 'link out' && from ? laneRow(from) : n.y);
    }
    return rowOf.get(n.id);
  };
  placed.forEach(laneRow);
  // Slot of each target of a node that has more than one wire out.
  const slotOf = new Map();
  placed.forEach((a) => {
    let slot = 0;
    const entries = [];
    (a.wires || []).forEach((out) => {
      if (out.length === 0) {
        slot += 1;
        return;
      }
      out.forEach((id) => {
        entries.push({ id, slot });
        slot += 1;
      });
    });
    if (slot > 1) {
      entries.forEach((e) => slotOf.set(`${e.id}|${a.id}`, { slot: e.slot, slots: slot }));
    }
  });
  const newY = new Map();
  placed.slice().sort((a, b) => a.x - b.x || a.y - b.y).forEach((n) => {
    let y = rowOf.get(n.id);
    const from = feeders.get(n.id);
    const fork = from.length === 1 ? slotOf.get(`${n.id}|${from[0].id}`) : null;
    if (fork) {
      y = newY.get(from[0].id) + (fork.slot - (fork.slots - 1) / 2) * FORK_SPACING;
    }
    newY.set(n.id, y);
  });
  // Starters (no feeder) that feed the same node stack around that node.
  const starters = new Map();
  placed.forEach((n) => {
    const targets = (n.wires || []).flat();
    const start = feeders.get(n.id).length === 0 && !['link in', 'comment', 'catch'].includes(n.type);
    if (start && targets.length === 1 && byId.has(targets[0])) {
      starters.set(targets[0], [...(starters.get(targets[0]) || []), n]);
    }
  });
  starters.forEach((group, target) => {
    if (group.length >= 2) {
      group.sort((a, b) => a.y - b.y);
      group.forEach((n, j) => {
        newY.set(n.id, newY.get(target) + (j - (group.length - 1) / 2) * FORK_SPACING);
      });
    }
  });
  placed.forEach((n) => {
    n.y = newY.get(n.id);
  });
}

// Moves the nodes of a flow left (never right of a column that is already
// tight). Rules, nodes taken from left to right:
// - a node with no feeder (inject, link in, comment) starts `startLeft` px
//   from the left border (its left edge, the centre is on the 20 px grid);
// - a node at the same x as its feeder (a link out below its node) takes the
//   new x of the feeder;
// - a node to the right of its feeders goes `gap` px after the widest
//   feeder end;
// - no node touches an earlier node of its row (less than `gap` px).
export function compactLanes(nodes, gap = LAYOUT_GAP, startLeft = LAYOUT_START_LEFT, fork = true) {
  // Rows first (fork rule, switched off for the old chain flow), then the columns.
  if (fork) {
    fanForks(nodes);
  }
  const placed = nodes.filter((n) => typeof n.x === 'number');
  const feeders = new Map(placed.map((n) => [n.id, []]));
  placed.forEach((a) => {
    (a.wires || []).flat().forEach((id) => {
      if (feeders.has(id)) {
        feeders.get(id).push(a);
      }
    });
  });
  const order = placed.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const newX = new Map();
  order.forEach((node) => {
    let x = startLeft + nodeWidth(node) / 2;
    const before = feeders.get(node.id).filter((f) => newX.has(f.id) && f.x <= node.x);
    if (before.length) {
      x = 0;
      before.forEach((f) => {
        const same = f.x === node.x;
        const next = same ? newX.get(f.id)
          : newX.get(f.id) + (nodeWidth(f) + nodeWidth(node)) / 2 + gap;
        x = Math.max(x, next);
      });
    }
    // Do not touch a node of the same row that comes earlier in the row.
    order.forEach((other) => {
      const done = newX.has(other.id) && other.x <= node.x;
      if (done && other !== node && Math.abs(other.y - node.y) < SAME_ROW_PX) {
        const same = other.x === node.x;
        if (!same) {
          x = Math.max(x, newX.get(other.id) + (nodeWidth(other) + nodeWidth(node)) / 2 + gap);
        }
      }
    });
    newX.set(node.id, 20 * Math.ceil(x / 20));
  });
  placed.forEach((n) => {
    n.x = newX.get(n.id);
  });
}

// Counts pairs of nodes in one row whose estimated boxes are less than `gap`
// px apart. Returns { overlaps, gaps }: gaps is the sorted list of gaps
// between wired neighbours in the same row.
export function measureSpacing(nodes, gap = 0) {
  const placed = nodes.filter((n) => typeof n.x === 'number');
  let overlaps = 0;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      if (Math.abs(a.y - b.y) >= SAME_ROW_PX) {
        continue;
      }
      const between = Math.abs(a.x - b.x) - (nodeWidth(a) + nodeWidth(b)) / 2;
      if (between < gap) {
        overlaps++;
      }
    }
  }
  const byId = new Map(placed.map((n) => [n.id, n]));
  const gaps = [];
  placed.forEach((a) => {
    (a.wires || []).flat().forEach((id) => {
      const b = byId.get(id);
      if (b && b.x > a.x && Math.abs(a.y - b.y) < SAME_ROW_PX) {
        gaps.push(b.x - nodeWidth(b) / 2 - (a.x + nodeWidth(a) / 2));
      }
    });
  });
  return { overlaps, gaps: gaps.sort((p, q) => p - q) };
}
