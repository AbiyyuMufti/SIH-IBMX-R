// Downloads the files of a SharePoint folder (Microsoft Graph, read-only) into a local folder,
// and can keep watching the folder so that you only get what is new or changed.
// Run it on your own computer; put it in scripts/ next to lib-ih.js (it loads .env from there).
// Usage: node scripts/sharepoint-graph-download.js [--list] [--force] [--baseline]
//          [--watch [seconds]] [--folder "<path>"] [--out <local dir>] [--drive <drive id>]
//   --list      only list what is new or changed, no download
//   --force     download everything again (first check only), ignore the state file
//   --baseline  mark the files that exist now as seen WITHOUT downloading them, so that
//               only files added or changed afterwards are taken
//   --watch     check again every N seconds (default 300) until you press Ctrl+C
//   --folder    folder inside the library (default GRAPH_FOLDER from .env, else the Plan OPT folder)
//   --out       local folder (default downloads/sharepoint)
// .env needs (names only):
//   GRAPH_DRIVE_ID   id of the "Documents" library
//   and ONE way to get a token:
//   a) GRAPH_TENANT_ID + GRAPH_CLIENT_ID + GRAPH_CLIENT_SECRET (app registration). The script asks
//      Microsoft for a token itself and renews it before it expires. Used when all three are set.
//   b) GRAPH_TOKEN: your own token, copied from Graph Explorer (tab "Access token"). After a 401
//      the script reads .env again, so you can paste a new token while it is running.
// Changes are found by size + modified time, kept in <out>/.sharepoint-state.json.
// Files deleted in SharePoint are not deleted locally. Tokens are never printed.
import {
  mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, createWriteStream, statSync
} from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import './lib-ih.js'; // loads .env

const argv = process.argv.slice(2);

function opt(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const listOnly = argv.includes('--list');
const force = argv.includes('--force');
const baseline = argv.includes('--baseline');
const watchSec = argv.includes('--watch') ? (Number(opt('--watch', 300)) || 300) : 0;
const FOLDER = opt('--folder', process.env.GRAPH_FOLDER || 'General/Power BI/OEE Board A Sz/Plan OPT')
  .replace(/^\/+|\/+$/g, '');
const OUT = resolve(opt(
  '--out',
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'downloads', 'sharepoint')
));
const DRIVE = opt('--drive', process.env.GRAPH_DRIVE_ID);
const TENANT = process.env.GRAPH_TENANT_ID;
const CLIENT_ID = process.env.GRAPH_CLIENT_ID;
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
const ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const BASE = 'https://graph.microsoft.com/v1.0';
const STATE_FILE = resolve(OUT, '.sharepoint-state.json');

const missing = [];
const authVars = {
  GRAPH_TENANT_ID: TENANT,
  GRAPH_CLIENT_ID: CLIENT_ID,
  GRAPH_CLIENT_SECRET: CLIENT_SECRET
};
const authSet = Object.values(authVars).filter(Boolean).length;
const AUTO = authSet === 3;
if (authSet > 0 && !AUTO) {
  missing.push(...Object.keys(authVars).filter((k) => !authVars[k]));
} else if (!AUTO && !process.env.GRAPH_TOKEN) {
  missing.push('GRAPH_TOKEN (or GRAPH_TENANT_ID + GRAPH_CLIENT_ID + GRAPH_CLIENT_SECRET)');
}
if (!DRIVE) {
  missing.push('GRAPH_DRIVE_ID (or --drive)');
}
if (missing.length) {
  console.error('Missing (names only):', missing.join(', '));
  process.exit(2);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function now() {
  return new Date().toLocaleTimeString();
}

// GRAPH_TOKEN from .env (read again every time), else from the environment.
function envToken() {
  try {
    for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*GRAPH_TOKEN\s*=\s*(.*?)\s*$/);
      if (m && m[1]) {
        return m[1].replace(/^["']|["']$/g, '');
      }
    }
  } catch (e) {
    // no .env file: use the environment
  }
  return process.env.GRAPH_TOKEN;
}

// Expiry time (ms) of a JWT, 0 when it cannot be read.
function expiryOf(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp * 1000;
  } catch (e) {
    return 0;
  }
}

let current = { token: null, exp: 0 };

// Client-credentials token from the app registration. Never prints the secret or the token.
async function requestToken() {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    })
  });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  if (!res.ok || !body || !body.access_token) {
    const why = body && body.error
      ? ` (${body.error}: ${String(body.error_description || '').split('\n')[0]})`
      : '';
    const err = new Error(`token request: HTTP ${res.status}${why}`);
    err.status = res.status;
    throw err;
  }
  current = { token: body.access_token, exp: Date.now() + Number(body.expires_in) * 1000 };
  console.log(`${now()} new Graph token, valid ${Math.round(Number(body.expires_in) / 60)} min`);
  return current.token;
}

async function getToken() {
  if (AUTO) {
    // renew 5 minutes before it runs out
    return current.token && Date.now() < current.exp - 300000 ? current.token : requestToken();
  }
  if (!current.token) {
    current = { token: envToken(), exp: 0 };
    const exp = expiryOf(current.token);
    if (exp) {
      const mins = Math.round((exp - Date.now()) / 60000);
      console.log(`${now()} GRAPH_TOKEN ${mins > 0 ? `expires in ${mins} min` : 'is already expired'}`);
    }
  }
  return current.token;
}

// After a 401: get a new token if there is one. Returns true when a retry makes sense.
function renewToken(rejected) {
  if (AUTO) {
    current = { token: null, exp: 0 };
    return true;
  }
  const fresh = envToken();
  if (fresh && fresh !== rejected) {
    current = { token: null, exp: 0 };
    return true;
  }
  return false;
}

// GET with a short retry on throttling (429) and 503, and one new token after a 401.
async function graph(url, accept = 'application/json') {
  let renewed = false;
  for (let attempt = 0; ; attempt++) {
    const token = await getToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: accept } });
    if (res.status === 401 && !renewed) {
      renewed = true;
      if (renewToken(token)) {
        continue;
      }
    }
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      await sleep(Number(res.headers.get('retry-after') || 2) * 1000);
      continue;
    }
    return res;
  }
}

// An Error that carries the HTTP status and Graph's own error code and message.
async function httpError(res, what) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body && body.error ? ` (${body.error.code}: ${body.error.message})` : '';
  } catch (e) {
    detail = '';
  }
  const hint = res.status === 401
    ? (AUTO ? '. Graph rejected the app token even after renewing it' : '. The token is expired or not valid, get a new GRAPH_TOKEN')
    : '';
  const err = new Error(`${what}: HTTP ${res.status}${hint}${detail}`);
  err.status = res.status;
  return err;
}

// Every file under a folder (recursive, follows paging). out: [{id, rel, size, modified}]
async function collect(folderPath, rel, out) {
  const segments = folderPath.split('/').map(encodeURIComponent).join('/');
  let url = `${BASE}/drives/${DRIVE}/root:/${segments}:/children`
    + '?$top=200&$select=id,name,size,lastModifiedDateTime,folder,file';
  while (url) {
    const res = await graph(url);
    if (!res.ok) {
      throw await httpError(res, `list ${folderPath}`);
    }
    const body = await res.json();
    for (const item of body.value || []) {
      const itemRel = rel ? `${rel}/${item.name}` : item.name;
      if (item.folder) {
        await collect(`${folderPath}/${item.name}`, itemRel, out);
      } else if (item.file && !item.name.startsWith('~$')) {
        out.push({
          id: item.id,
          rel: itemRel,
          size: Number(item.size),
          modified: item.lastModifiedDateTime
        });
      }
    }
    url = body['@odata.nextLink'];
  }
}

// Streams one file to disk (files can be large), checks the size, then renames.
// Returns null when fine, else a short reason.
async function download(file) {
  const target = resolve(OUT, file.rel);
  if (!target.startsWith(OUT + sep)) {
    return 'path leaves the output folder';
  }
  const res = await graph(`${BASE}/drives/${DRIVE}/items/${file.id}/content`, '*/*');
  if (!res.ok || !res.body) {
    return `HTTP ${res.status}`;
  }
  mkdirSync(dirname(target), { recursive: true });
  const part = `${target}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
  const got = statSync(part).size;
  if (got !== file.size) {
    return `size ${got} instead of ${file.size}`;
  }
  renameSync(part, target);
  return null;
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveState(state) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// One check of the folder. Returns the number of failed downloads.
async function cycle(first) {
  const files = [];
  await collect(FOLDER, '', files);
  const state = readState();
  const fresh = [];
  for (const f of files) {
    const stamp = `${f.size}|${f.modified}`;
    const seen = state[f.rel];
    const upToDate = seen === `${stamp}|baseline`
      || (seen === stamp && existsSync(resolve(OUT, f.rel)));
    if (!upToDate || (force && first)) {
      fresh.push({ f, stamp, isNew: seen === undefined });
    }
  }

  if (listOnly) {
    console.log(`found ${files.length} file(s) in ${FOLDER}, ${fresh.length} new or changed`);
    fresh.forEach((x) => console.log(x.isNew ? 'NEW    ' : 'CHANGED', x.f.rel, x.f.size));
    return 0;
  }

  if (baseline && first) {
    fresh.forEach((x) => {
      state[x.f.rel] = `${x.stamp}|baseline`;
    });
    saveState(state);
    console.log(`${now()} baseline: ${files.length} existing file(s) marked as seen, nothing downloaded`);
    return 0;
  }

  let failed = 0;
  let got = 0;
  for (const { f, stamp, isNew } of fresh) {
    const why = await download(f);
    if (why) {
      failed++;
      console.log(`${now()} FAILED`, f.rel, why);
      continue;
    }
    state[f.rel] = stamp;
    got++;
    console.log(`${now()} ${isNew ? 'NEW    ' : 'CHANGED'}`, f.rel, f.size);
  }
  if (got || failed) {
    saveState(state);
  }
  if (!watchSec) {
    console.log(`found ${files.length} file(s), downloaded ${got}, unchanged ${files.length - fresh.length}, failed ${failed}, into ${OUT}`);
  }
  return failed;
}

if (watchSec) {
  console.log(`watching ${FOLDER} every ${watchSec} s (Ctrl+C to stop)`);
}
let failedTotal = 0;
for (let first = true; ; first = false) {
  try {
    failedTotal += await cycle(first);
  } catch (e) {
    if (e.status === 401 || !watchSec) {
      console.error(e.message);
      process.exit(1);
    }
    console.error(`${now()} ${e.message}, will try again`);
  }
  if (!watchSec) {
    break;
  }
  await sleep(watchSec * 1000);
}
process.exit(failedTotal ? 1 : 0);