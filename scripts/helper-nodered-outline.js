// Read-only, no network. Outlines OUTBOUND calls in a Node-RED flows export.
// Never prints secret values: long tokens, Bearer/Basic values and quoted values of
// password/secret/token/key properties are redacted before printing.
// Ignores http in / http response nodes (Node-RED as a server is out of scope).
// Usage: node scripts/helper-nodered-outline.js source/<flows>.json [--func id1,id2]
//   --func prints the full (redacted) source of the listed function nodes and exits.
import { readFileSync } from 'node:fs';

const nodes = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const funcArg = process.argv.indexOf('--func');
const byId = new Map(nodes.map((n) => [n.id, n]));
const tabOf = (n) => byId.get(n.z)?.label ?? byId.get(n.z)?.name ?? '(no tab)';
const label = (n) => n.name || n.label || `${n.type}:${n.id}`;

const redact = (s) =>
  String(s)
    .replace(/(Bearer|Basic)\s+[A-Za-z0-9+/=._-]{6,}/gi, '$1 <REDACTED>')
    .replace(/((?:password|passwd|secret|client_?secret|api_?key|token|authorization|bearer|credential)[\w.\]['"]*\s*[:=]\s*)(["'`])[^"'`]+\2/gi, '$1$2<REDACTED>$2')
    .replace(/[A-Za-z0-9+=_-]{32,}/g, '<LONG>');

// reverse wiring
const upstream = new Map();
for (const n of nodes) for (const out of n.wires ?? []) for (const to of out) (upstream.get(to) ?? upstream.set(to, []).get(to)).push(n.id);

const KEY_LINES = /msg\.(url|headers|method|payload|req|topic|query|body)|flow\.(get|set)|global\.(get|set)|env\.get|process\.env|Authorization|Bearer|Basic|fetch\(|axios|http\.|https\.|require\(|\.set\(|url\s*[:=]|host|baseUrl|tenant/i;
const keyLines = (code, max = 14) =>
  String(code ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && KEY_LINES.test(l))
    .slice(0, max)
    .map((l) => '      | ' + redact(l).slice(0, 200));

const isHttpReq = (n) => n.type === 'http request';
const isFetchFn = (n) => n.type === 'function' && /\b(fetch|axios|https?\.request|https?\.get|require\(['"]https?['"]\)|got\(|needle|request\()/.test(n.func ?? '');
// Insights Hub (MindSphere) SDK nodes: call platform APIs internally, no URL in the node
const SDK_TYPES = new Set(['read timeseries', 'write timeseries', 'read-oee', 'create event', 'list objects', 'read aggregates', 'asset-type', 'subscribe timeseries', 'read object', 'write object', 'extract parameter', 'parquet']);
const isSdk = (n) => SDK_TYPES.has(n.type) && n.type !== 'parquet' && n.type !== 'extract parameter';

function chain(id, depth = 4) {
  const seen = new Set([id]);
  let frontier = [id];
  const lines = [];
  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const f of frontier) {
      for (const u of upstream.get(f) ?? []) {
        if (seen.has(u)) continue;
        seen.add(u);
        next.push(u);
        const un = byId.get(u);
        if (!un) continue;
        lines.push(`    up${d}: [${un.type}] "${label(un)}" (${un.id})`);
        if (un.type === 'function') lines.push(...keyLines(un.func));
        else if (un.type === 'change' || un.type === 'template')
          lines.push(...(un.rules ? un.rules.map((r) => `      | ${r.t} ${r.p} = ${r.pt ?? ''} ${redact(String(r.to ?? '')).slice(0, 140)}`) : [`      | ${redact(String(un.template ?? '')).slice(0, 200)}`]));
        else if (un.type === 'inject') lines.push(`      | trigger: ${un.repeat ? 'every ' + un.repeat + 's' : ''}${un.crontab ? ' cron ' + un.crontab : ''}${un.once ? ' once on start' : ''}${!un.repeat && !un.crontab && !un.once ? 'manual' : ''}; topic=${un.topic ?? ''}`);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return lines;
}
const downstream = (n) =>
  (n.wires ?? []).flat().map((id) => byId.get(id)).filter(Boolean).map((d) => `[${d.type}] "${label(d)}"`).join(', ') || '-';

if (funcArg > 0) {
  for (const id of process.argv[funcArg + 1].split(',')) {
    const n = byId.get(id);
    console.log(`
===== ${id} [${n?.type}] "${n ? label(n) : '?'}" tab="${n ? tabOf(n) : '?'}"`);
    if (n?.type === 'function') console.log(redact(n.func));
    else console.log(redact(JSON.stringify(n, null, 1)));
  }
  process.exit(0);
}

let c = 0;
for (const n of nodes) {
  if (n.type === 'tab' || n.type === 'http in' || n.type === 'http response') continue;
  if (!(isHttpReq(n) || isFetchFn(n) || isSdk(n))) continue;
  c++;
  const kind = isHttpReq(n) ? 'HTTP-REQUEST' : isSdk(n) ? 'SDK-NODE' : 'FUNCTION-FETCH';
  console.log(`\n#${c} ${kind} tab="${tabOf(n)}" node="${label(n)}" id=${n.id}${n.d ? ' [DISABLED NODE]' : ''}${byId.get(n.z)?.disabled ? ' [DISABLED TAB]' : ''}`);
  if (isHttpReq(n)) {
    console.log(`    method=${n.method} url=${n.url || '(from msg.url)'} ret=${n.ret} paytoqs=${n.paytoqs} authType=${n.authType || '-'} mindspherePath=${n.mindspherePath || '-'} useMindsphereAuth=${n.useMindsphereAuth ?? '-'} isAdmin=${n.isAdmin ?? '-'} tls=${n.tls ? 'yes' : '-'} senderr=${n.senderr ?? '-'} headers=${JSON.stringify((n.headers ?? []).map((h) => h.keyType === 'other' ? h.keyValue : h.keyType))}`);
    if (n.headers?.length) console.log('    hdr-values:', n.headers.map((h) => `${h.keyValue || h.keyType}=${/\{\{|msg\./.test(h.valueValue ?? '') ? h.valueValue : '<literal>'}`).join('; '));
  } else if (isSdk(n)) {
    const keys = Object.keys(n).filter((k) => !['id', 'type', 'z', 'name', 'x', 'y', 'wires', 'g', 'd'].includes(k));
    console.log('    config keys:', keys.map((k) => `${k}=${/pass|secret|token|key/i.test(k) ? '<hidden>' : redact(JSON.stringify(n[k])).slice(0, 80)}`).join(', '));
  } else {
    for (const l of keyLines(n.func, 25)) console.log(l);
  }
  console.log('    downstream:', downstream(n));
  for (const l of chain(n.id)) console.log(l);
}
console.error('OUTBOUND NODES:', c);
