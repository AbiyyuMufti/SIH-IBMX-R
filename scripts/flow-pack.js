// Puts the code of every function node of a flow into a directory, one
// file per function. Asks for the flow and the directory when not given.
// Usage: npm run flow-pack -- [flow] [directory]
//   npm run flow-pack "vfc-powerbi-tables" "flow-function/powerbi-tables"
// flow: a path, or a name that is looked up in flows/ (with or without
//       .json, for example vfc-powerbi-tables or vfc-pbi-reference.local)
import { createInterface } from 'node:readline/promises';
import {
  readFunctions, extract, findFlow, flowNames
} from './flow-functions.js';

async function ask(rl, question) {
  const answer = await rl.question(question);
  return answer.trim();
}

async function main() {
  let [flow, dir] = process.argv.slice(2);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (!flow) {
      console.log('Flows in flows/:');
      flowNames().forEach((n) => console.log(`  ${n}`));
      flow = await ask(rl, 'Flow name or path: ');
    }
    const path = findFlow(flow);
    if (!path) {
      throw new Error(`flow not found: ${flow}`);
    }
    if (!dir) {
      const base = path.replace(/^.*[\\/]/, '').replace(/\.json$/, '');
      const suggestion = `flow-function/${base}`;
      dir = await ask(rl, `Directory [${suggestion}]: `);
      dir = dir || suggestion;
    }
    extract(readFunctions(path), dir);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
