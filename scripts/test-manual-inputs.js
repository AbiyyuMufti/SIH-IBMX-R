// Phase B group 2 (GET only after token): operator input on GT4 (manual OEE).
// Reads OEE manualInputs, the OEE_Hourly_Entry time series, comments and productionTarget over
// several windows. Emails are masked before printing. Run: node scripts/test-manual-inputs.js [assetName]
import { cfg, getToken, apiGet, saveSample } from './lib-ih.js';

const name = process.argv[2] || 'GT4';
const AM = '/api/assetmanagement/v3';
const TS = '/api/iottimeseries/v3/timeseries';
const HAL = { accept: 'application/hal+json' };
const mask = (s) => String(s).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<EMAIL>');
const shape = (v, d = 0) => {
  if (Array.isArray(v)) return `array(${v.length})` + (v.length && d < 3 ? ` of ${shape(v[0], d + 1)}` : '');
  if (v && typeof v === 'object') return d >= 3 ? 'object' : '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${shape(x, d + 1)}`).join(', ') + ' }';
  return v === null ? 'null' : typeof v;
};
const show = (v, n = 500) => mask(typeof v === 'string' ? JSON.stringify(v.slice(0, n)) : JSON.stringify(v).slice(0, n));

const tok = await getToken();
const oeeList = (await apiGet(`${cfg.oeePath}/assets`, tok.token)).body;
const asset = oeeList.find((a) => a.name === name);
console.log('Asset %s: isManual=%s isConfigured=%s', asset.name, asset.isManual, asset.isConfigured);

const asp = await apiGet(`${AM}/assets/${asset.assetId}/aspects`, tok.token, HAL);
console.log('Aspects:', (asp.body._embedded?.aspects ?? []).map((a) => a.name).join(', '));

const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();
const windows = [['24h', 24], ['48h', 48], ['7d', 168]];
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

console.log('\n== OEE GET /assets/{id}/manualInputs?from&to ==');
for (const [label, h] of windows) {
  const r = await apiGet(`${cfg.oeePath}/assets/${asset.assetId}/manualInputs`, tok.token, { query: { from: iso(now - h * 3600e3), to: iso(now) } });
  const rows = Array.isArray(r.body) ? r.body : r.body?.manualInputs ?? r.body?.items ?? null;
  console.log('%s -> HTTP %d in %dms; shape: %s', label, r.status, r.ms, mask(shape(r.body)).slice(0, 700));
  if (Array.isArray(rows)) {
    console.log('   %d entries', rows.length);
    if (rows[0]) console.log('   first:', show(rows[0], 700));
    if (rows.length > 1) console.log('   last :', show(rows[rows.length - 1], 400));
  } else console.log('   body:', show(r.body, 400));
  if (label === '7d') saveSample(`oee_manualinputs_${slug}.json`, { request: 'GET /api/oee/v3/assets/{assetId}/manualInputs?from&to (7d)', status: r.status, headers: r.headers, body: Array.isArray(rows) ? rows.slice(0, 5) : r.body });
}

console.log('\n== IoT Time Series OEE_Hourly_Entry (what the form writes) ==');
for (const [label, h] of windows) {
  const r = await apiGet(`${TS}/${asset.assetId}/OEE_Hourly_Entry`, tok.token, { query: { from: iso(now - h * 3600e3), to: iso(now), limit: 2000 } });
  const rows = Array.isArray(r.body) ? r.body : [];
  console.log('%s -> HTTP %d in %dms; %s', label, r.status, r.ms, Array.isArray(r.body) ? rows.length + ' records' : show(r.body, 300));
  if (rows.length) {
    console.log('   fields:', Object.keys(rows[rows.length - 1]).join(', '));
    console.log('   newest:', show(rows[rows.length - 1], 900));
    if (label === '7d') saveSample(`ts_${slug}_OEE_Hourly_Entry.json`, { request: 'GET /api/iottimeseries/v3/timeseries/{assetId}/OEE_Hourly_Entry (7d)', status: r.status, headers: r.headers, body: rows.slice(-5) });
  }
}

console.log('\n== other operator-input reads (7d) ==');
const from7 = iso(now - 168 * 3600e3), to = iso(now);
for (const p of ['comment', 'productionTarget', 'downtimeReasons', 'topDowntimeReasons', 'topRejectReasons']) {
  const r = await apiGet(`${cfg.oeePath}/assets/${asset.assetId}/${p}`, tok.token, { query: { from: from7, to } });
  console.log('/%s -> HTTP %d in %dms; shape: %s', p, r.status, r.ms, mask(shape(r.body)).slice(0, 500));
  if (r.status !== 200) console.log('   body:', show(r.body, 400));
  else saveSample(`oee_${p}_${slug}.json`, { request: `GET /api/oee/v3/assets/{assetId}/${p}?from&to (7d)`, status: r.status, headers: r.headers, body: Array.isArray(r.body) ? r.body.slice(0, 5) : r.body });
}
