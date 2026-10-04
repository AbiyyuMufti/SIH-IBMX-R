// Offline checks for a Node-RED / VFC flow export. No network, read only.
// Usage: node scripts/validate-flow.js [flow.json ...]
//   No arguments = every flows/*.json except the *.local.json copies.
// Exit code 1 when a check fails. Warnings do not fail the run.
// The rules are in CLAUDE.md, section "Flow readability".
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAX_LINE = 80;
const MAX_ITEMS_ON_ONE_LINE = 3;
const MAX_LOGIC_LINES = 50;
const MIN_HEADER_LINES = 2;
const MAX_HEADER_LINES = 4;
const BLOCK_WORDS = ['else', 'try', 'finally', 'do'];
const FORBIDDEN = /\b(fetch\s*\(|require\s*\(|process\.|setTimeout\s*\(|async\s+function|await\s)/;

// ---------------------------------------------------------------------------
// Scanner: blanks out strings, regex literals and comments so that the
// structure checks only see code. Returns the masked lines and the set of
// line numbers that contain a comment.
// ---------------------------------------------------------------------------
function scan(code) {
  const masked = [''];
  const commentLines = new Set();
  let line = 0;
  let prev = '';
  let word = '';
  let prevSpace = false;

  const put = (ch) => {
    masked[line] += ch;
  };
  const newline = () => {
    masked.push('');
    line++;
  };
  const regexAllowed = () => {
    if (prev === '') return true;
    if ('(,=:[!&|?{};+-*%<>'.includes(prev)) return true;
    return word === 'return' || word === 'typeof';
  };

  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const n = code[i + 1];
    if (c === '\n') {
      newline();
      prevSpace = true;
      i++;
      continue;
    }
    if (c === '/' && n === '/') {
      commentLines.add(line);
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      commentLines.add(line);
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') {
          newline();
          commentLines.add(line);
        }
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < code.length && code[i] !== c) {
        if (code[i] === '\\') i++;
        if (code[i] === '\n') newline();
        i++;
      }
      i++;
      put('"');
      prev = '"';
      word = '';
      prevSpace = false;
      continue;
    }
    if (c === '/' && regexAllowed()) {
      i++;
      let inClass = false;
      while (i < code.length && (code[i] !== '/' || inClass)) {
        if (code[i] === '\\') i++;
        else if (code[i] === '[') inClass = true;
        else if (code[i] === ']') inClass = false;
        i++;
      }
      i++;
      while (/[a-z]/.test(code[i] || '')) i++;
      put('"');
      prev = '"';
      word = '';
      prevSpace = false;
      continue;
    }
    put(c);
    if (/\s/.test(c)) {
      prevSpace = true;
    } else {
      if (/[A-Za-z0-9_$]/.test(c)) {
        word = prevSpace && /[A-Za-z0-9_$]/.test(prev) ? c : word + c;
      } else {
        word = '';
      }
      prev = c;
      prevSpace = false;
    }
    i++;
  }
  return { masked, commentLines };
}

// ---------------------------------------------------------------------------
// Style checks for the code of one function node.
// ---------------------------------------------------------------------------
export function lintFunction(code) {
  const errors = [];
  const raw = code.split('\n');
  const { masked, commentLines } = scan(code);
  const dataLines = new Set();
  const at = (line, text) => errors.push(`line ${line + 1}: ${text}`);

  // 1. line length
  raw.forEach((text, i) => {
    if (text.length > MAX_LINE) at(i, `${text.length} characters (max ${MAX_LINE})`);
  });

  // 2. comment above the code, never after it
  commentLines.forEach((i) => {
    if (masked[i].trim() !== '') at(i, 'comment after code, move it to its own line above');
  });

  // 3. header comment
  let header = 0;
  while (header < raw.length && raw[header].trim().startsWith('//')) header++;
  if (header < MIN_HEADER_LINES || header > MAX_HEADER_LINES) {
    errors.push(
      `header: ${header} comment line(s) at the top, need ${MIN_HEADER_LINES} to ${MAX_HEADER_LINES}`
    );
  }

  // 4. structure: blocks, literals, statements per line
  const stack = [];
  let prevSig = '';
  let prevWord = '';
  masked.forEach((text, line) => {
    for (let col = 0; col < text.length; col++) {
      const c = text[col];
      const top = stack[stack.length - 1];
      if (/\s/.test(c)) continue;
      const rest = text.slice(col + 1).trim();

      if (top && c !== ')' && c !== ']' && c !== '}') top.hasContent = true;

      if (c === '{') {
        let kind = 'object';
        const startsStatement = prevSig === '' || ';{}'.includes(prevSig);
        const isArrow = prevSig === '>' && text[col - 2] === '=';
        const afterBlockWord = /\w/.test(prevSig) && BLOCK_WORDS.includes(prevWord);
        if (prevSig === ')' || startsStatement || isArrow || afterBlockWord) kind = 'block';
        stack.push({ kind, line, commas: 0, hasContent: false, multi: false });
      } else if (c === '[') {
        const kind = /[\w)\]"]/.test(prevSig) ? 'index' : 'array';
        stack.push({ kind, line, commas: 0, hasContent: false, multi: false });
      } else if (c === '(') {
        stack.push({ kind: 'paren', line, commas: 0, hasContent: false, multi: false });
      } else if (c === ')' || c === ']' || c === '}') {
        const open = stack.pop();
        if (open && (open.kind === 'array' || open.kind === 'object')) {
          const items = open.commas + (open.hasContent ? 1 : 0);
          if (open.line === line && items > MAX_ITEMS_ON_ONE_LINE) {
            at(line, `${open.kind} with ${items} items on one line, one item per line`);
          }
          if (open.line !== line) {
            for (let l = open.line + 1; l <= line; l++) dataLines.add(l);
            if (items > MAX_ITEMS_ON_ONE_LINE && open.multi) {
              at(open.line, `${open.kind} with ${items} items, one item per line`);
            }
          }
        }
        if (open && open.kind === 'block' && open.line === line) {
          at(line, 'block on one line, put { and } on their own lines');
        }
      } else if (c === ',' && top && (top.kind === 'array' || top.kind === 'object')) {
        top.commas++;
        if (rest !== '') top.multi = true;
      } else if (c === ';' && (!top || top.kind !== 'paren') && rest !== '') {
        at(line, 'more than one statement on a line');
      }

      if (/[A-Za-z0-9_$]/.test(c)) {
        prevWord = /[A-Za-z0-9_$]/.test(prevSig) ? prevWord + c : c;
      } else {
        prevWord = '';
      }
      prevSig = c;
    }
  });

  // 5. if/for/while without braces on one line
  masked.forEach((text, line) => {
    const m = text.match(/^\s*(?:\}\s*else\s+)?(if|for|while)\s*\(/);
    if (!m) return;
    let depth = 0;
    for (let col = text.indexOf('('); col < text.length; col++) {
      if (text[col] === '(') depth++;
      if (text[col] === ')') depth--;
      if (depth === 0) {
        const rest = text.slice(col + 1).trim();
        if (rest !== '' && rest !== '{') at(line, `${m[1]} without braces, use a block`);
        break;
      }
    }
  });

  // 6. syntax and APIs that the VFC function node does not have
  try {
    new Function('flow', 'node', 'msg', 'Buffer', code);
  } catch (e) {
    errors.push(`syntax error: ${e.message}`);
  }
  const found = masked.join('\n').match(FORBIDDEN);
  if (found) errors.push(`uses ${found[0].trim()}, not available in the VFC function node`);

  // logic lines = code lines that are not data literals
  let logic = 0;
  masked.forEach((text, i) => {
    if (text.trim() !== '' && !dataLines.has(i)) logic++;
  });
  return { errors, logicLines: logic, longest: Math.max(...raw.map((x) => x.length)) };
}

// ---------------------------------------------------------------------------
// Flow checks: ids, wires, links, cycles, debug fan-in, backward wires.
// ---------------------------------------------------------------------------
export function validateFlow(nodes) {
  const errors = [];
  const warnings = [];
  const label = (n) => `${n.type} "${n.name || n.label || n.id}"`;
  if (!Array.isArray(nodes)) {
    return { errors: ['flow is not a JSON array'], warnings, stats: {} };
  }

  const byId = new Map();
  for (const n of nodes) {
    if (byId.has(n.id)) errors.push(`duplicate node id ${n.id}`);
    byId.set(n.id, n);
  }

  // edges: wires plus link out -> link in
  const edges = [];
  for (const n of nodes) {
    for (const out of n.wires || []) {
      for (const t of out) {
        const target = byId.get(t);
        if (!target) {
          errors.push(`${label(n)}: wire to missing node ${t}`);
          continue;
        }
        edges.push({ from: n, to: target, link: false });
        if (target.x < n.x) errors.push(`${label(n)} -> ${label(target)}: wire goes backward, use a link`);
      }
    }
    if (n.type === 'link out') {
      for (const t of n.links || []) {
        const target = byId.get(t);
        if (!target || target.type !== 'link in') {
          errors.push(`${label(n)}: link to missing link in ${t}`);
          continue;
        }
        if (!(target.links || []).includes(n.id)) errors.push(`${label(n)}: ${label(target)} does not list it`);
        edges.push({ from: n, to: target, link: true });
      }
    }
    if (n.type === 'link in') {
      for (const t of n.links || []) {
        const source = byId.get(t);
        if (!source || source.type !== 'link out') errors.push(`${label(n)}: link from missing link out ${t}`);
        else if (!(source.links || []).includes(n.id)) errors.push(`${label(n)}: ${label(source)} does not list it`);
      }
      if (!(n.links || []).length) errors.push(`${label(n)}: no link out points to it`);
    }
  }

  // cycles
  const next = new Map(nodes.map((n) => [n.id, []]));
  edges.forEach((e) => next.get(e.from.id).push(e.to.id));
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 1) {
      errors.push(`cycle: ${[...path, id].map((x) => byId.get(x).name || x).join(' -> ')}`);
      return;
    }
    if (state.get(id) === 2) return;
    state.set(id, 1);
    for (const t of next.get(id)) visit(t, [...path, id]);
    state.set(id, 2);
  };
  nodes.forEach((n) => visit(n.id, []));

  // incoming edges per node
  const incoming = new Map(nodes.map((n) => [n.id, 0]));
  edges.forEach((e) => incoming.set(e.to.id, incoming.get(e.to.id) + 1));
  for (const n of nodes) {
    if (n.type === 'debug' && incoming.get(n.id) > 1) {
      errors.push(`${label(n)}: ${incoming.get(n.id)} wires come in, one debug node per source`);
    }
    const isStart = ['inject', 'comment', 'tab', 'link in'].includes(n.type);
    if (!isStart && incoming.get(n.id) === 0) warnings.push(`${label(n)}: nothing is wired to it`);
  }

  // function nodes
  const stats = { nodes: nodes.length, functions: 0, linkIn: 0, linkOut: 0, longestLine: 0, longestIn: '' };
  for (const n of nodes) {
    if (n.type === 'link in') stats.linkIn++;
    if (n.type === 'link out') stats.linkOut++;
    if (n.type !== 'function') continue;
    stats.functions++;
    const r = lintFunction(n.func || '');
    r.errors.forEach((e) => errors.push(`${label(n)}: ${e}`));
    if (r.longest > stats.longestLine) {
      stats.longestLine = r.longest;
      stats.longestIn = n.name;
    }
    if (r.logicLines > MAX_LOGIC_LINES) {
      warnings.push(`${label(n)}: ${r.logicLines} lines of logic (about ${MAX_LOGIC_LINES} is the target), consider splitting`);
    }
  }
  return { errors, warnings, stats };
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL('../flows/', import.meta.url);
  const files = process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(dir)
        .filter((f) => f.endsWith('.json') && !f.endsWith('.local.json'))
        .map((f) => fileURLToPath(new URL(f, dir)));
  let failed = false;
  for (const file of files) {
    const { errors, warnings, stats } = validateFlow(JSON.parse(readFileSync(file, 'utf8')));
    console.log(`\n${file}`);
    errors.forEach((e) => console.log(`  FAIL ${e}`));
    warnings.forEach((w) => console.log(`  warn ${w}`));
    console.log(
      `  ${stats.nodes} nodes, ${stats.functions} function nodes, ` +
        `${stats.linkIn} link in / ${stats.linkOut} link out, ` +
        `longest line ${stats.longestLine} characters (${stats.longestIn})`
    );
    console.log(errors.length ? `  RESULT: FAIL (${errors.length})` : '  RESULT: PASS');
    if (errors.length) failed = true;
  }
  process.exit(failed ? 1 : 0);
}
