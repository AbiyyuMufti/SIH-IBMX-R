// Smoke check after the move to Xcelerator IAM and the siemens.app domain.
// Read-only: GET calls, the token POSTs and one read-style POST (evaluateKPIs).
// Every call uses redirect: 'manual'. Secrets, tenant IDs and asset IDs are
// never printed. Run: node scripts/smoke-check.js
import './lib-ih.js';

// Settings
const OLD_HOST = 'https://gateway.eu1.mindsphere.io';
const NEW_HOST = 'https://api.eu1.siemens.app';
const SUFFIX = '-1000001700';
const OLD_TOKEN_URL = process.env.RECKITT_IAM_TOKEN_URL
  || 'https://reckitt.piam.eu1.mindsphere.io/oauth/token';
const ID_VAR = 'RECKITT_API_TECHUSER_CLIENT_ID';
const SECRET_VAR = 'RECKITT_API_TECHUSER_CLIENT_SECRET';
const ASSET_NAME = 'B2 Line';

const hiddenWords = [];

function hide(text) {
  let out = String(text);
  for (const word of hiddenWords) {
    if (word) {
      out = out.split(word).join('<hidden>');
    }
  }
  out = out.replace(/\b[0-9a-f]{32}\b/gi, '<id>');
  // The listed suffix is not a tenant ID: keep it readable.
  out = out.split(SUFFIX).join('<suffix>');
  out = out.replace(/\b\d{10}\b/g, '<10-digit>');
  out = out.split('<suffix>').join(SUFFIX);
  return out;
}

function log(...parts) {
  console.log(hide(parts.join(' ')));
}

function hostOf(location, base) {
  try {
    return new URL(location, base).host;
  } catch {
    return '?';
  }
}

async function call(method, url, headers, body) {
  const options = { method, headers, redirect: 'manual' };
  if (body !== undefined) {
    options.body = body;
  }
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const location = res.headers.get('location');
    return {
      status: res.status,
      json,
      text,
      redirectHost: location ? hostOf(location, url) : '',
    };
  } catch (err) {
    return {
      status: 0,
      json: null,
      text: '',
      redirectHost: '',
      error: err.cause?.code || err.message,
    };
  }
}

function decodeJwt(token) {
  try {
    const part = token.split('.')[1];
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function tenantShape(value) {
  const text = String(value);
  if (/^\d{10}$/.test(text)) {
    return '10 digits';
  }
  if (text.length === 8) {
    return '8 characters';
  }
  return `${text.length} characters`;
}

function describeToken(label, token) {
  const claims = decodeJwt(token);
  if (!claims) {
    log(`${label}: token is not a readable JWT`);
    return;
  }
  const names = Object.keys(claims).filter((k) => /(^|\.)ten(ant)?$/i.test(k));
  // Hide the tenant value before anything is printed (iss can contain it).
  for (const name of names) {
    hiddenWords.push(String(claims[name]));
  }
  log(`${label}: iss =`, claims.iss);
  for (const name of names) {
    log(`${label}: tenant claim "${name}" is ${tenantShape(claims[name])}`);
  }
  if (!names.length) {
    log(`${label}: no claim named ten or tenant`);
  }
}

async function oldToken() {
  if (!process.env[ID_VAR] || !process.env[SECRET_VAR]) {
    log('Token (old way): SKIPPED, client id or secret missing in .env');
    return null;
  }
  const basic = Buffer.from(
    `${process.env[ID_VAR]}:${process.env[SECRET_VAR]}`,
  ).toString('base64');
  const res = await call(
    'POST',
    `${OLD_TOKEN_URL}?grant_type=client_credentials`,
    { Authorization: `Basic ${basic}`, Accept: 'application/json' },
  );
  log('Token (old way): HTTP', res.status, res.redirectHost
    ? `redirect to ${res.redirectHost}` : '');
  if (!res.json?.access_token) {
    log('Token (old way): error code field =', res.json?.error ?? '-');
    return null;
  }
  describeToken('Token (old way)', res.json.access_token);
  return res.json.access_token;
}

async function newToken() {
  const tenantId = process.env.XC_TENANT_ID;
  if (!tenantId) {
    log('Token (new way): SKIPPED, XC_TENANT_ID is missing in .env');
    return null;
  }
  hiddenWords.push(tenantId);
  if (!process.env[ID_VAR] || !process.env[SECRET_VAR]) {
    log('Token (new way): SKIPPED, client id or secret missing in .env');
    return null;
  }
  const basic = Buffer.from(
    `${process.env[ID_VAR]}:${process.env[SECRET_VAR]}`,
  ).toString('base64');
  const res = await call(
    'POST',
    `https://${tenantId}.eu1.sws.siemens.com/oauth/token`,
    {
      Authorization: `Basic ${basic}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    'grant_type=client_credentials',
  );
  log('Token (new way): HTTP', res.status, res.redirectHost
    ? `redirect to ${res.redirectHost}` : '',
  res.error ? `network error ${res.error}` : '');
  if (!res.json?.access_token) {
    log('Token (new way): error code field =', res.json?.error ?? '-');
    return null;
  }
  describeToken('Token (new way)', res.json.access_token);
  return res.json.access_token;
}

// path uses the OLD form. suffixPath() inserts the suffix after the service.
function suffixPath(path) {
  return path.replace(
    /^(\/api\/[a-z]+)(\/v\d+)/,
    (all, service, version) => `${service}${SUFFIX}${version}`,
  );
}

function buildCalls(assetId, aspect) {
  const oee = '/api/oee/v3';
  const am = '/api/assetmanagement/v3';
  const ts = '/api/iottimeseries/v3';
  const range = {
    from: '2026-09-30T00:00:00.000Z',
    to: '2026-10-01T00:00:00.000Z',
  };
  const calls = [
    { name: 'OEE health', path: `${oee}/health`, expect: 200 },
    { name: 'OEE version', path: `${oee}/version`, expect: 200 },
    { name: 'OEE assets', path: `${oee}/assets`, expect: 200 },
    { name: 'OEE one asset', path: `${oee}/assets/${assetId}`, expect: 200 },
    { name: 'OEE asset config', path: `${oee}/assets/${assetId}/config`,
      expect: 200 },
    { name: 'OEE filterValues', path: `${oee}/assets/${assetId}/filterValues`,
      query: range, expect: 200 },
    { name: 'OEE topDowntimeReasons',
      path: `${oee}/assets/${assetId}/topDowntimeReasons`,
      query: range, expect: 200 },
    { name: 'OEE productionTarget',
      path: `${oee}/assets/${assetId}/productionTarget`,
      query: range, expect: 200 },
    { name: 'OEE manualInputs', path: `${oee}/assets/${assetId}/manualInputs`,
      query: range, expect: 200 },
    { name: 'OEE reasontrees', path: `${oee}/reasontrees`, expect: 200 },
    { name: 'OEE calendars', path: `${oee}/calendars`, expect: 200 },
    { name: 'OEE stateTables', path: `${oee}/stateTables`, expect: 200 },
    { name: 'OEE productCollections', path: `${oee}/productCollections`,
      expect: 200 },
    { name: 'OEE productUnits', path: `${oee}/productUnits`, expect: 200 },
    { name: 'OEE qualityCodes', path: `${oee}/qualityCodes`, expect: 200 },
    { name: 'OEE timeModel', path: `${oee}/timeModel`, expect: 200 },
    { name: 'OEE measureCollections', path: `${oee}/measureCollections`,
      expect: 200 },
    { name: 'OEE rejectReasonCollections',
      path: `${oee}/rejectReasonCollections`, expect: 200 },
    { name: 'OEE expressions', path: `${oee}/expressions`, expect: 200 },
    { name: 'OEE microStops', path: `${oee}/microStops`, expect: 200 },
    { name: 'OEE application/settings', path: `${oee}/application/settings`,
      expect: 404 },
    { name: 'AM assets (1 row)', path: `${am}/assets`, query: { size: '1' },
      accept: 'application/hal+json', expect: 200 },
    { name: 'AM root asset', path: `${am}/assets/root`,
      accept: 'application/hal+json', expect: 200 },
    { name: 'AM one asset', path: `${am}/assets/${assetId}`,
      accept: 'application/hal+json', expect: 200 },
    { name: 'AM aspects', path: `${am}/assets/${assetId}/aspects`,
      accept: 'application/hal+json', expect: 200 },
    { name: 'AM assettypes', path: `${am}/assettypes`,
      accept: 'application/hal+json', expect: 403 },
  ];
  if (aspect) {
    calls.push({
      name: 'TS latest record',
      path: `${ts}/timeseries/${assetId}/${aspect}`,
      query: { limit: '1' },
      expect: 200,
    });
  }
  return calls;
}

const combos = [
  { id: 'a', host: OLD_HOST, suffix: false, tokenKey: 'old',
    label: 'old host, old token' },
  { id: 'b', host: OLD_HOST, suffix: false, tokenKey: 'new',
    label: 'old host, new token' },
  { id: 'c', host: NEW_HOST, suffix: true, tokenKey: 'new',
    label: 'new host, new token' },
  { id: 'd', host: NEW_HOST, suffix: true, tokenKey: 'old',
    label: 'new host, old token' },
];

function urlFor(combo, spec) {
  const path = combo.suffix ? suffixPath(spec.path) : spec.path;
  const url = new URL(combo.host + path);
  for (const [k, v] of Object.entries(spec.query ?? {})) {
    url.searchParams.set(k, v);
  }
  return { url, path };
}

async function getCall(combo, spec, token) {
  const { url, path } = urlFor(combo, spec);
  const res = await call('GET', url, {
    Authorization: `Bearer ${token}`,
    Accept: spec.accept || 'application/json',
  });
  return { path, res };
}

function verdict(res, expect) {
  if (res.status === expect) {
    return 'as docs';
  }
  return 'DIFF';
}

function rowText(combo, spec, path, res) {
  const parts = [
    combo.id,
    'GET',
    path,
    res.status || `ERR ${res.error}`,
    combo.host.replace('https://', ''),
    res.redirectHost ? `redirect to ${res.redirectHost}` : 'no redirect',
    `docs ${spec.expect}: ${verdict(res, spec.expect)}`,
  ];
  return parts.join(' | ');
}

async function findAsset(token) {
  const res = await call('GET', `${OLD_HOST}/api/oee/v3/assets`, {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  });
  if (!Array.isArray(res.json)) {
    return null;
  }
  const found = res.json.find((a) => a.name === ASSET_NAME);
  return found ? found.assetId : null;
}

async function findAspect(token, assetId) {
  const res = await call(
    'GET',
    `${OLD_HOST}/api/assetmanagement/v3/assets/${assetId}/aspects`,
    { Authorization: `Bearer ${token}`, Accept: 'application/hal+json' },
  );
  const list = res.json?._embedded?.aspects;
  return Array.isArray(list) && list[0] ? list[0].name : null;
}

async function kpiCall(combo, token, assetId) {
  const spec = { path: '/api/oee/v3/expressions/evaluateKPIs' };
  const { url, path } = urlFor(combo, spec);
  const body = {
    assetId,
    scope: {
      from: '2026-09-30T00:00:00.000Z',
      to: '2026-10-01T00:00:00.000Z',
      filter: [
        { key: 'PRODUCT', value: [] },
        { key: 'ORDER', value: [] },
        { key: 'SHIFT', value: [] },
      ],
      recursive: false,
      groupedByDateTime: false,
    },
  };
  const res = await call(
    'POST',
    url,
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    JSON.stringify(body),
  );
  const count = Array.isArray(res.json?.results) ? res.json.results.length : '-';
  log(
    [combo.id, 'POST', path, res.status || `ERR ${res.error}`,
      combo.host.replace('https://', ''),
      res.redirectHost ? `redirect to ${res.redirectHost}` : 'no redirect',
      `results ${count}`].join(' | '),
  );
  return { status: res.status, count };
}

async function main() {
  log('== Tokens ==');
  const tokens = { old: await oldToken(), new: await newToken() };
  if (!tokens.old) {
    log('No old token, cannot continue.');
    return;
  }
  const assetId = await findAsset(tokens.old);
  if (!assetId) {
    log('Asset not found on the old host, cannot continue.');
    return;
  }
  hiddenWords.push(assetId);
  const aspect = await findAspect(tokens.old, assetId);
  const calls = buildCalls(assetId, aspect);

  log('\n== GET calls (combo | method | path | status | host | redirect | docs) ==');
  const healthy = [];
  for (const combo of combos) {
    const token = tokens[combo.tokenKey];
    if (!token) {
      log(`${combo.id} | SKIPPED (${combo.label}): no ${combo.tokenKey} token`);
      continue;
    }
    let okCount = 0;
    for (const spec of calls) {
      const { path, res } = await getCall(combo, spec, token);
      log(rowText(combo, spec, path, res));
      if (res.status === spec.expect) {
        okCount += 1;
      }
      if (spec.name === 'OEE health' && res.status === 200) {
        healthy.push(combo);
      }
    }
    log(`${combo.id} (${combo.label}): ${okCount} of ${calls.length} as docs`);
  }

  log('\n== evaluateKPIs, one asset, 2026-09-30 (combos with health 200) ==');
  for (const combo of healthy) {
    await kpiCall(combo, tokens[combo.tokenKey], assetId);
  }
}

await main();
