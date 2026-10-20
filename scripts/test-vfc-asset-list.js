// Offline test of the Config tab: the checks of 1.1 CONFIG (lines, report
// source) and the asset list of stage 2 and 3 (c3-asset-path, c3-build-list).
// Usage: node scripts/test-vfc-asset-list.js
import vm from 'node:vm';
import { code } from './lib-flow-builder.js';

let failed = 0;
const check = (ok, text) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`);
  if (!ok) failed++;
};
const run = (source, msg, flowData = {}, globData = {}) => {
  const errors = [];
  const node = { status: () => {}, error: (e) => errors.push(e), warn: () => {} };
  const ctx = (data) => ({ get: (k) => data[k], set: (k, v) => { data[k] = v; } });
  const fn = vm.runInNewContext(
    '(function(flow,glob,node,msg,Buffer){' + source + '\n})', {});
  return { out: fn(ctx(flowData), ctx(globData), node, msg, Buffer), errors, globData };
};

// ---- 1.1 CONFIG ----
const config = code('c1-config.js').replace(/platform: '[^']*'/, "platform: 'legacy'");
const B2 = 'cf4565d7da1e4efcbc0ea6a4814b8eee';
const GT4 = 'bc08dae161124f1cb533199f556190b3';
let r = run(config, {});
const hull = r.globData.cfg && r.globData.cfg.sites.find((s) => s.name === 'Hull');
check(r.errors.length === 0 && hull, 'committed Config is stored');
check(JSON.stringify(hull.assetIds) === JSON.stringify([B2, GT4]),
  'assetIds = the ids of all lines of the site');
check(JSON.stringify(hull.reportLineIds) === JSON.stringify([B2]),
  'reportLineIds = the lines with shiftReport true');
for (const [from, to, what] of [
  ["report: 'GT4'", "report: '?'", 'report still ?'],
  [`id: '${GT4}'`, `id: '${B2}'`, 'the same id twice'],
  [`id: '${GT4}'`, "id: 'GT4'", 'an id that is not 32 characters'],
  ["sih: 'GT4',", "sih: '',", 'empty sih name'],
  ["reportSource: 'provideam',", "reportSource: 'SIH',", 'unknown site source'],
  ["report: 'GT4'", "report: 'GT4',\n reportSource: 'x'", 'unknown line source']
]) {
  r = run(config.replace(from, to), {});
  check(r.errors.length === 1 && r.globData.cfg === undefined, `${what}: Config not stored`);
}

// ---- 3.2 Shape asset path ----
const path = code('c3-asset-path.js');
const am = (names, ids) => ({
  statusCode: 200,
  payload: {
    name: names[names.length - 1],
    hierarchyPath: names.slice(0, -1).map((name, i) => ({ name, assetId: ids[i] }))
  }
});
const shaped = run(path, {
  asset: { id: 'L1', name: 'B2 line', isManual: false },
  ...am(['reckitt', 'EU', 'Hull', 'Bottles', 'B2 line'], ['R', 'E', 'H', 'A'])
}).out.payload;
check(shaped.names.join('/') === 'reckitt/EU/Hull/Bottles/B2 line' &&
  shaped.ancestorIds.join() === 'R,E,H,A', 'asset path: names root first, ancestor ids');
const bad = run(path, { asset: { id: 'X', name: 'X' }, statusCode: 404, payload: {} }).out.payload;
check(/HTTP 404/.test(bad.failed), 'asset path: a failed call is marked');

// ---- 3.3 Build asset list ----
const item = (id, names, ancestorIds, isManual = false) => ({
  id, name: names[names.length - 1], names, ancestorIds, isManual, failed: null
});
const cfg = {
  excludeNames: [],
  excludeAncestorNames: ['Test Line'],
  sites: [{
    name: 'Hull',
    lines: [
      { id: B2, sih: 'B2 Line', report: 'B2 Auto' },
      { id: GT4, sih: 'GT4', report: 'GT4' }
    ]
  }]
};
const items = [
  item(B2, ['reckitt', 'EU', 'Hull', 'Bottles', 'B2 line'], ['R', 'E', 'H', 'A']),
  item('M1', ['reckitt', 'EU', 'Hull', 'Bottles', 'B2 line', '02 Filler'], ['R', 'E', 'H', 'A', B2]),
  item('T1', ['reckitt', 'EU', 'Hull', 'Test Line', 'GT4'], ['R', 'E', 'H', 'T']),
  item('N1', ['reckitt', 'EU', 'Nottingham', 'Solid dose', 'N1'], ['R', 'E', 'N', 'S'], true),
  { ...item('F1', [], []), name: 'Broken', failed: 'asset details failed, HTTP 500' }
];
const list = run(code('c3-build-list.js'), { payload: items }, { cfg }).out.payload;
check(list.lines.length === 2, `two lines (machine and Test Line left out): ${list.lines.length}`);
check(/Hull \/ Bottles \/ B2 line \| auto \| id cf45.* \| 1 machines \| in Config as B2 Auto/.test(list.lines[0]),
  'a Config line: path, auto, id, machine count, report name');
check(/Nottingham \/ Solid dose \/ N1 \| manual .*not in Config/.test(list.lines[1]),
  'a new line is marked not in Config');
check(/id: 'N1',\n  sih: 'N1',\n  report: '\?'/.test(list.paste.Nottingham) && !list.paste.Hull,
  'paste block only for the lines not in Config, report left as ?');
const problems = list.problems.join(' | ');
check(/GT4: id not found/.test(problems), 'a Config id that is gone is a problem');
check(/now calls it "B2 line"/.test(problems), 'a renamed line is a problem');
check(/Broken: asset details failed/.test(problems), 'a failed asset call is a problem');

console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exitCode = failed ? 1 : 0;
