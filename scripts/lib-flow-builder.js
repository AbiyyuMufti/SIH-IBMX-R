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
      const wiresFor = (outs, fan) =>
        outs.map((o, k) => {
          if (o === 'next') return [nextId];
          if (fan) return [linkOut(o, col(c + 1), rowY(r) + (k - (outs.length - 1) / 2) * 40)];
          return [linkOut(o, col(c) + 120, rowY(r) + 60)];
        });
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
