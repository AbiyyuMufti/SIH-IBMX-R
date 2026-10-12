// Reads the function nodes of a Node-RED / VFC flow JSON, so the code can be
// read without opening the editor. Read only: the flow file is never changed.
// Usage:
//   node scripts/flow-functions.js <flow.json>                 list
//   node scripts/flow-functions.js <flow.json> show <text>     print code
//   node scripts/flow-functions.js <flow.json> extract <dir>   write files
// list:    one line per function node in reading order (tab, row, column)
// show:    code of every function whose name or number contains <text>
// extract: one .js file per function node plus functions.json (id, name,
//          file), which a later repack tool can use to put the code back
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync
} from 'node:fs';
import { pathToFileURL } from 'node:url';

// Nodes in the same lane are this far apart in y (see CLAUDE.md layout)
const ROW_STEP = 220;

// "2.3 Choose assets" -> 2.003, null when the name has no number
function stepNumber(name) {
  const match = /^(\d+)\.(\d+)/.exec(name);
  return match ? Number(match[1]) + Number(match[2]) / 1000 : null;
}

export function readFunctions(path) {
  const nodes = JSON.parse(readFileSync(path, 'utf8'));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const tabs = new Map();
  nodes.forEach((n) => {
    if (n.type === 'tab' || n.type === 'subflow') {
      tabs.set(n.id, n.label || n.name || n.id);
    }
  });
  const list = nodes
    .filter((n) => n.type === 'function')
    .map((n) => {
      const targets = [];
      (n.wires || []).forEach((port, index) => {
        port.forEach((id) => {
          const to = byId.get(id);
          targets.push({ port: index + 1, name: to ? to.name || to.type : id });
        });
      });
      return {
        id: n.id,
        name: n.name || '(no name)',
        tab: tabs.get(n.z) || '(no tab)',
        x: n.x,
        y: n.y,
        outputs: n.outputs,
        func: n.func || '',
        targets
      };
    });
  list.sort((a, b) => {
    if (a.tab !== b.tab) {
      return a.tab.localeCompare(b.tab);
    }
    // Names start with stage.step (1.2): this beats hand-moved positions
    const stepA = stepNumber(a.name);
    const stepB = stepNumber(b.name);
    if (stepA !== null && stepB !== null && stepA !== stepB) {
      return stepA - stepB;
    }
    const rowA = Math.round(a.y / ROW_STEP);
    const rowB = Math.round(b.y / ROW_STEP);
    return rowA - rowB || a.x - b.x;
  });
  return list;
}

function lineCount(text) {
  return text === '' ? 0 : text.split('\n').length;
}

function printList(list) {
  let tab = null;
  list.forEach((f, index) => {
    if (f.tab !== tab) {
      tab = f.tab;
      console.log(`\n== ${tab}`);
    }
    const number = String(index + 1).padStart(3, ' ');
    const lines = String(lineCount(f.func)).padStart(4, ' ');
    console.log(`${number}  ${f.name}  (${lines} lines, ${f.outputs} out)`);
    f.targets.forEach((t) => {
      console.log(`         out ${t.port} -> ${t.name}`);
    });
  });
  console.log(`\n${list.length} function nodes`);
}

function printCode(list, text) {
  const wanted = text.toLowerCase();
  const found = list.filter((f, index) => {
    const number = String(index + 1);
    return f.name.toLowerCase().includes(wanted) || number === text;
  });
  if (!found.length) {
    console.log(`no function matches "${text}"`);
    return;
  }
  found.forEach((f) => {
    console.log(`\n// ===== ${f.tab} / ${f.name} =====`);
    console.log(f.func);
  });
}

function fileName(f, index) {
  const number = String(index + 1).padStart(3, '0');
  const slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${number}-${slug.replace(/^-|-$/g, '')}.js`;
}

export function extract(list, dir) {
  mkdirSync(dir, { recursive: true });
  // Remove only the files an earlier extract listed in functions.json,
  // so renumbered functions leave no stale files. Other files stay.
  const oldManifest = `${dir}/functions.json`;
  if (existsSync(oldManifest)) {
    JSON.parse(readFileSync(oldManifest, 'utf8')).forEach((entry) => {
      rmSync(`${dir}/${entry.file}`, { force: true });
    });
  }
  const manifest = list.map((f, index) => {
    const file = fileName(f, index);
    writeFileSync(`${dir}/${file}`, f.func);
    return { id: f.id, name: f.name, tab: f.tab, file };
  });
  writeFileSync(
    `${dir}/functions.json`,
    JSON.stringify(manifest, null, 2) + '\n'
  );
  console.log(`wrote ${list.length} files and functions.json to ${dir}`);
}

const FLOW_DIR = 'flows';

// A path, or a name looked up in flows/ (with or without .json)
export function findFlow(name) {
  const candidates = [name, `${name}.json`, `${FLOW_DIR}/${name}`];
  candidates.push(`${FLOW_DIR}/${name}.json`);
  return candidates.find((c) => c.endsWith('.json') && existsSync(c));
}

export function flowNames() {
  return readdirSync(FLOW_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

function printUsage(problem) {
  console.log(problem);
  console.log('');
  console.log('Usage: npm run flow-list -- <flow> [command]');
  console.log('  <flow>             name in flows/ or a path to a .json file');
  console.log('  (no command)       list the function nodes');
  console.log('  show <text>        print the code of matching functions');
  console.log('  extract <dir>      write one file per function to <dir>');
  console.log('');
  console.log('Example: npm run flow-list -- vfc-powerbi-tables show 4.1');
  console.log('');
  console.log('Flows in flows/:');
  flowNames().forEach((n) => console.log(`  ${n}`));
  process.exitCode = 1;
}

function main() {
  const [flow, command = 'list', argument] = process.argv.slice(2);
  if (!flow) {
    printUsage('No flow given.');
    return;
  }
  const path = findFlow(flow);
  if (!path) {
    printUsage(`Flow not found: ${flow}`);
    return;
  }
  const functions = readFunctions(path);
  if (command === 'list') {
    printList(functions);
  } else if (command === 'show' && argument) {
    printCode(functions, argument);
  } else if (command === 'extract' && argument) {
    extract(functions, argument);
  } else {
    printUsage(`Unknown command, or <text>/<dir> missing: ${command}`);
  }
}

// Run only when started from the command line, not when imported
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
