// Shared helpers of the VFC flow generators: type names, the function
// code reader, the tab builder (nodes on a 20 px grid, link nodes) and the
// lane steps. Used by build-vfc-reference-flows.js and build-vfc-site-flows.js.
import { readFileSync } from 'node:fs';

export const code = (file) => readFileSync(new URL(`./vfc/${file}`, import.meta.url), 'utf8');

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
  // word = a link out "to <WORD>" below the node (fan: stacked to the right).
  function lane(r, title, info, steps) {
    stageNo++;
    comment(`[${stageNo}] ${title}`, `STAGE ${stageNo} - ${info}`, r);
    let fnNo = 0;
    steps.forEach((step, i) => {
      const c = i;
      const nextStep = steps[i + 1];
      let nextId = null;
      if (nextStep && nextStep.t === 'end') {
        nextId = linkOut(nextStep.key, col(c + 1), rowY(r));
      } else if (nextStep) {
        nextId = id(nextStep.key);
      }
      const wiresFor = (outs, fan) =>
        outs.map((o, k) => {
          if (o === 'next') return [nextId];
          if (fan) return [linkOut(o, col(c + 1), rowY(r) + (k - (outs.length - 1) / 2) * 40)];
          return [linkOut(o, col(c) + 120, rowY(r) + 60)];
        });
      const pos = { x: col(c), y: rowY(r) };
      if (step.t === 'linkin') {
        linkIn(step.key, c, r, nextId);
      } else if (step.t === 'fn') {
        fnNo++;
        let func = code(step.file);
        for (const [from, to] of Object.entries(step.replace || {})) {
          func = func.replaceAll(from, to);
        }
        add({
          id: id(step.key), type: 'function', name: `${stageNo}.${fnNo} ${step.name}`,
          func, outputs: step.outs.length, language: 'javascript', noerr: 0, ...pos,
          wires: wiresFor(step.outs, step.fan)
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
          timeout: '1', timeoutUnits: 'seconds', rate: '1', nbRateUnits: '1', rateUnits: 'second',
          randomFirst: '1', randomLast: '1', randomUnits: 'seconds', drop: false,
          powerMode: false, ...pos, wires: [[nextId]]
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
      } else if (step.t === 'write') {
        add({
          id: id(step.key), type: 'write object', name: `${step.table} to data lake`, path: '',
          mode: 'object', ...pos, wires: []
        });
      }
    });
  }
  return { nodes, TAB, add, newId, id, col, rowY, comment, lane, linkOut, nextStage: () => ++stageNo };
}

// ---------- step helpers ----------
export const fn = (key, name, file, outs, replace = {}, fan = false) => ({ t: 'fn', key, name, file, outs, replace, fan });
export const http = (key, name) => ({ t: 'http', key, name });
export const linkInStep = (key) => ({ t: 'linkin', key });
export const end = (key) => ({ t: 'end', key });
export const split = (key) => ({ t: 'split', key });
export const delay = (key, name) => ({ t: 'delay', key, name });
export const join = (key, name) => ({ t: 'join', key, name });

