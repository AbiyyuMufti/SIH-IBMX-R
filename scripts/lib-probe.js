// Small helper for exploration scripts: call one GET endpoint and print a compact, non-secret summary.
// GET only. Emails are masked. Saves a redacted sample (arrays cut to the first 3 items).
import { apiGet, saveSample } from './lib-ih.js';

export const mask = (s) => String(s).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<EMAIL>');

export const shape = (v, d = 0, max = 3) => {
  if (Array.isArray(v)) return `array(${v.length})` + (v.length && d < max ? ` of ${shape(v[0], d + 1, max)}` : '');
  if (v && typeof v === 'object') return d >= max ? 'object' : '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${shape(x, d + 1, max)}`).join(', ') + ' }';
  return v === null ? 'null' : typeof v;
};

const findList = (b) => {
  if (Array.isArray(b)) return b;
  if (b && typeof b === 'object') {
    if (b._embedded) return Object.values(b._embedded).find(Array.isArray) ?? null;
    for (const v of Object.values(b)) if (Array.isArray(v)) return v;
  }
  return null;
};

const cut = (b) => {
  if (Array.isArray(b)) return b.slice(0, 3);
  if (b && typeof b === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(b)) o[k] = Array.isArray(v) ? v.slice(0, 3) : k === '_embedded' && v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, x]) => [a, Array.isArray(x) ? x.slice(0, 3) : x])) : v;
    return o;
  }
  return b;
};

// opts: { query, accept, sample: 'file_name.json', names: true }
export async function probe(label, path, token, opts = {}) {
  const r = await apiGet(path, token, { query: opts.query, accept: opts.accept });
  const list = findList(r.body);
  let line = `${label} -> HTTP ${r.status} in ${r.ms}ms`;
  if (r.status === 200) {
    line += list ? `, ${list.length} items` : '';
    console.log(line);
    console.log('   shape:', mask(shape(r.body)).slice(0, opts.shapeLen ?? 600));
    if (list?.length && opts.names !== false) {
      const names = list.map((x) => x?.name ?? x?.title ?? x?.id).filter(Boolean).slice(0, 10);
      if (names.length) console.log('   names:', mask(names.join(' | ')).slice(0, 400));
    }
    if (opts.show) console.log('   body:', mask(JSON.stringify(r.body)).slice(0, opts.show));
  } else {
    console.log(line);
    console.log('   body:', mask(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)).replace(/[0-9a-f]{32}/g, '<id>').slice(0, 400));
  }
  if (opts.sample) saveSample(opts.sample, { request: `GET ${path.replace(/[0-9a-f]{32}/g, '{id}')}${opts.query ? ' ' + JSON.stringify(Object.keys(opts.query)) : ''}`, status: r.status, headers: r.headers, body: r.status === 200 ? cut(r.body) : r.body });
  return r;
}
