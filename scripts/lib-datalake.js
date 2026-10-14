// Helpers for the Integrated Data Lake API (OpenAPI 3.14.0, tested below).
// Download and upload are two steps: ask for a signed URL (POST, answer 201),
// then GET or PUT that URL directly, without the Bearer token.
// Signed URLs contain a secret signature: they are never printed.
import { cfg, datalakePath } from './lib-ih.js';

export function lakeBase() {
  return cfg.gateway + datalakePath();
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return text.slice(0, 300);
  }
}

// GET /listObjects (scope dl.lst.r). A path ending in "/" is a folder.
export async function listObjects(token, path, nextToken) {
  const url = new URL(lakeBase() + '/listObjects');
  url.searchParams.set('path', path);
  if (nextToken) {
    url.searchParams.set('nextToken', nextToken);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  return { status: res.status, body: await readJson(res) };
}

// POST /generateDownloadObjectUrls (dl.ds.r, exactly 1 path)
// or /generateUploadObjectUrls (dl.ds.w, up to 30 paths). Both answer 201.
export async function signedUrl(token, kind, path) {
  const name = kind === 'upload' ? 'generateUploadObjectUrls' : 'generateDownloadObjectUrls';
  const res = await fetch(`${lakeBase()}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ paths: [{ path }] })
  });
  const body = await readJson(res);
  const first = body && body.objectUrls && body.objectUrls[0];
  return { status: res.status, body, url: first ? first.signedUrl : null };
}

export function hostOf(url) {
  return new URL(url).host;
}

// The sample pages name the header x-ms-blob-type for Azure storage only.
// Plain request first. Only if it is refused on an Azure host, retry once with it.
export async function callSigned(method, url, body) {
  const first = await fetch(url, { method, body });
  if (first.status < 400 || !/blob\.core\.windows\.net$/.test(hostOf(url))) {
    return { res: first, usedBlobHeader: false };
  }
  const second = await fetch(url, {
    method,
    body,
    headers: { 'x-ms-blob-type': 'BlockBlob' }
  });
  return { res: second, usedBlobHeader: true };
}

// Returns { ok, bytes } or { ok: false, why }.
export async function downloadOne(token, path) {
  const r = await signedUrl(token, 'download', path);
  if (r.status === 404) {
    return { ok: false, why: 'not found (404)' };
  }
  if (r.status !== 201 || !r.url) {
    return { ok: false, why: `signed URL failed (HTTP ${r.status})` };
  }
  const { res } = await callSigned('GET', r.url);
  if (!res.ok) {
    return { ok: false, why: `download failed (HTTP ${res.status})` };
  }
  return { ok: true, bytes: Buffer.from(await res.arrayBuffer()) };
}

