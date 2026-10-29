import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib-ih.js';

loadEnv();

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'https://rb-api.provideam.com';
const API_KEY_HEADER = 'apiKey';
const MIN_REQUEST_INTERVAL_MS = 300;
export const ALLOWED_REQUESTS = new Set([
  'GET /swagger/v1/swagger.json',
  'GET /api/v1/plant/getall',
  'GET /api/v1/area/get',
  'GET /api/v1/machine/get',
  'GET /api/v1/workcell/get',
  'GET /api/v1/machine/getmachinesettings',
  'GET /api/v1/machine/getmodes',
  'GET /api/v1/machine/getmodegroups',
  'GET /api/v1/machine/getmodesubgroups',
  'GET /api/v1/machine/getmachinetools',
  'GET /api/v1/machine/getmachineparts',
  'GET /api/v1/machine/getmachinestations',
  'GET /api/v1/machine/getmachinecurrentvalues',
  'GET /api/v1/machine/getshifts',
  'GET /api/v1/machine/getprodshifts',
  'GET /api/v1/machine/getmachineschdowntimes',
  'GET /api/v1/shift/getshiftstartdate',
  'GET /api/v1/shift/getshift',
  'GET /api/v1/mode/getmodetypes',
  'GET /api/v1/dictionary/get',
  'GET /api/v1/report/getavailableobjects',
  'GET /api/v1/report/getavailablefields',
  'GET /api/v1/report/getavailablefunctions',
  'GET /api/v1/report/getavailablelosses',
  'GET /api/v1/report/getavailableperiods',
  'POST /api/v1/Report/ObjectByPeriod',
  'POST /api/v1/report/objectbyperiod',
  'POST /api/v1/report/objectbyperiodandloss',
  'POST /api/v1/report/periodbyobject',
  'POST /api/v1/report/periodbyobjectandloss',
  'POST /api/v1/report/currentstatus',
  'POST /api/v1/report/userview/userview',
  'POST /api/v1/report/objectmodelog',
  'POST /api/v1/report/objectyieldlog',
]);

let lastRequestAt = 0;
const verifiedRequestsPath = resolve(
  root,
  'samples/provideam/verified-requests.json',
);

function assertAllowed(method, path) {
  const key = `${method.toUpperCase()} ${path}`;
  if (!ALLOWED_REQUESTS.has(key)) {
    throw new Error(`Provideam request is not allowlisted: ${key}`);
  }
}

async function waitForRequestSlot() {
  const elapsed = Date.now() - lastRequestAt;
  const delay = MIN_REQUEST_INTERVAL_MS - elapsed;
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  lastRequestAt = Date.now();
}

async function recordVerifiedRequest(key, status) {
  if (!(status >= 200 && status < 300) && status !== 400 && status !== 422) {
    return;
  }
  const existing = await readFile(verifiedRequestsPath, 'utf8')
    .then((text) => JSON.parse(text))
    .catch((error) => {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    });
  const verified = new Set(existing);
  verified.add(key);
  const sorted = [...verified].sort();
  const directory = dirname(verifiedRequestsPath);
  await mkdir(directory, { recursive: true });
  await writeFile(
    verifiedRequestsPath,
    `${JSON.stringify(sorted, null, 2)}\n`,
    'utf8',
  );
}

export async function request(method, path, options = {}) {
  const verb = method.toUpperCase();
  assertAllowed(verb, path);
  if (verb === 'GET' && options.body !== undefined) {
    throw new Error('Provideam GET requests cannot include a body');
  }
  if (verb === 'POST' && options.body === undefined) {
    throw new Error('Provideam POST requests require an explicit body');
  }
  const contentType = options.contentType ?? 'application/json';
  if (
    contentType !== 'application/json' &&
    contentType !== 'application/json-patch+json'
  ) {
    throw new Error('Provideam request content type is not allowlisted');
  }

  const apiKey = process.env.PROVIDEAM_API_KEY;
  if (!apiKey) {
    throw new Error('PROVIDEAM_API_KEY is not configured');
  }

  const url = new URL(path, BASE_URL);
  if (url.origin !== BASE_URL || url.pathname !== path) {
    throw new Error('Provideam request path must be a fixed allowlisted path');
  }
  for (const [name, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(name, String(value));
  }

  await waitForRequestSlot();
  const response = await fetch(url, {
    method: verb,
    headers: {
      [API_KEY_HEADER]: apiKey,
      Accept: 'application/json',
      ...(options.body === undefined
        ? {}
        : { 'Content-Type': contentType }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    redirect: 'error',
  });

  const text = await response.text();
  try {
    const data = text === '' ? null : JSON.parse(text);
    await recordVerifiedRequest(
      `${verb} ${path}`,
      response.status,
    );
    return {
      status: response.status,
      ok: response.ok,
      data,
    };
  } catch {
    throw new Error(
      `Provideam ${verb} ${path} returned non-JSON (HTTP ${response.status})`,
    );
  }
}

export function redactSensitive(value) {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    if (
      /password|salt|token|secret|api.?key|operator|user(name|id)?|email|contactperson|actor(email|name|id)?/i.test(key)
    ) {
      continue;
    }
    result[key] = redactSensitive(nested);
  }
  return result;
}

export async function saveSample(name, value) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error('Sample name must use lowercase letters, digits and hyphens');
  }
  const outputPath = resolve(root, `samples/provideam/${name}.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(redactSensitive(value), null, 2)}\n`,
    'utf8',
  );
}
