// Shared helpers for the exploration scripts. Plain ES module, Node 18+ native fetch.
// Secrets come from .env via process.env. Nothing here prints a secret or a token.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (works on Node 18). Empty values do not override anything.
export function loadEnv(file = resolve(root, '.env')) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || m[2] === '') continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadEnv();

export const cfg = {
  gateway: process.env.IH_GATEWAY_URL || 'https://gateway.eu1.mindsphere.io',
  tokenUrl: process.env.RECKITT_IAM_TOKEN_URL || 'https://reckitt.piam.eu1.mindsphere.io/oauth/token',
  oeePath: process.env.OEE_API_PATH || '/api/oee/v3',
};

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error('Missing in .env (names only):', missing.join(', '));
    process.exit(2);
  }
}

// Client-credentials token. This is a POST (the only POST needed to start).
// Returns { token, expiresIn, tokenType }. Never log `token`.
export async function getToken(idVar = 'RECKITT_API_TECHUSER_CLIENT_ID', secretVar = 'RECKITT_API_TECHUSER_CLIENT_SECRET') {
  requireEnv(idVar, secretVar);
  const basic = Buffer.from(`${process.env[idVar]}:${process.env[secretVar]}`).toString('base64');
  const res = await fetch(`${cfg.tokenUrl}?grant_type=client_credentials`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!res.ok || !body?.access_token) {
    // Print status and error fields only, never the request headers.
    const err = body ? { error: body.error, error_description: body.error_description, message: body.message } : { raw: text.slice(0, 200) };
    throw new Error(`Token request failed: HTTP ${res.status} ${JSON.stringify(err)}`);
  }
  return { token: body.access_token, expiresIn: body.expires_in, tokenType: body.token_type };
}

// GET only. Returns { status, headers (selected), body, ms }.
export async function apiGet(path, token, { query } = {}) {
  const url = new URL(path.startsWith('http') ? path : cfg.gateway + path);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  const t0 = Date.now();
  const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  const hdr = {};
  for (const h of ['content-type', 'etag', 'x-request-id', 'retry-after']) if (res.headers.get(h)) hdr[h] = res.headers.get(h);
  return { status: res.status, headers: hdr, body, ms: Date.now() - t0, url: url.toString() };
}

// Redact values that look like secrets/IDs before saving a sample.
// Keeps structure and field names; replaces tokens, emails and long hex IDs.
export function redact(value) {
  const s = JSON.stringify(value, null, 2)
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '<JWT>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<EMAIL>')
    .replace(/\b[0-9a-f]{32}\b/gi, '<ID32>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>');
  return s;
}

export function saveSample(name, value) {
  const dir = resolve(root, 'samples');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, name);
  writeFileSync(file, redact(value) + '\n');
  return file;
}
