// Phase B group 1 (GET only after token): IoT Time Series read for a B2 Line machine.
// Finds the machine through Asset Management (child of "B2 Line"), lists its aspects, then reads
// each OEE aspect for a recent window. Prints structure and a few non-secret values; saves redacted samples.
// Run: node scripts/test-timeseries.js [machineName] [hours]   (default: "02 Filler", 2)
import { getToken, apiGet, saveSample } from './lib-ih.js';

const machineName = process.argv[2] || '02 Filler';
const hours = Number(process.argv[3] || 2);
const AM = '/api/assetmanagement/v3';
const TS = '/api/iottimeseries/v3/timeseries';
const HAL = { accept: 'application/hal+json' };

const shape = (v, depth = 0) => {
  if (Array.isArray(v)) return `array(${v.length})` + (v.length && depth < 2 ? ` of ${shape(v[0], depth + 1)}` : '');
  if (v && typeof v === 'object') return depth >= 2 ? 'object' : '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${shape(x, depth + 1)}`).join(', ') + ' }';
  return v === null ? 'null' : typeof v;
};

const tok = await getToken();

// locate asset: child of "B2 Line"
const all = [];
for (let p = 0; p < 5; p++) {
  const r = await apiGet(`${AM}/assets`, tok.token, { query: { size: 200, page: p }, ...HAL });
  all.push(...(r.body._embedded?.assets ?? []));
  if (p + 1 >= (r.body.page?.totalPages ?? 1)) break;
}
const line = all.find((a) => a.name === 'B2 Line');
const machine = all.find((a) => a.parentId === line.assetId && a.name === machineName);
if (!machine) { console.log('machine %s not found under B2 Line', machineName); process.exit(1); }
console.log('Machine: %s (type ends with %s)', machine.name, machine.typeId.split('.').pop());

// its aspects
const asp = await apiGet(`${AM}/assets/${machine.assetId}/aspects`, tok.token, HAL);
const aspects = asp.body._embedded?.aspects ?? [];
console.log('Aspects (%d): %s', aspects.length, aspects.map((a) => a.name).join(', '));

// time window
const to = new Date();
const from = new Date(to.getTime() - hours * 3600 * 1000);
console.log('Window: last %dh (%s to %s)', hours, from.toISOString(), to.toISOString());

const getTs = async (aspect, query) => {
  let r = await apiGet(`${TS}/${machine.assetId}/${aspect}`, tok.token, { query });
  if (r.status === 500 && JSON.stringify(r.body).includes('No acceptable representation')) {
    console.log('   (retry with hal+json)');
    r = await apiGet(`${TS}/${machine.assetId}/${aspect}`, tok.token, { query, ...HAL });
  }
  return r;
};

for (const aspect of aspects.map((a) => a.name).filter((n) => n !== 'PlantContext')) {
  console.log('\n== %s ==', aspect);
  const r = await getTs(aspect, { from: from.toISOString(), to: to.toISOString() });
  const rows = Array.isArray(r.body) ? r.body : [];
  console.log('GET window -> HTTP %d in %dms; headers %s; %s', r.status, r.ms, JSON.stringify(r.headers), Array.isArray(r.body) ? rows.length + ' records' : 'body ' + JSON.stringify(r.body).slice(0, 300));
  if (rows.length) {
    const f = rows[0], l = rows[rows.length - 1];
    console.log('fields:', Object.keys(f).join(', '));
    console.log('types :', shape(f));
    console.log('first :', JSON.stringify(f).slice(0, 400));
    console.log('last  :', JSON.stringify(l).slice(0, 400));
  }
  saveSample(`ts_${machine.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${aspect}.json`, { request: `GET ${TS}/{assetId}/${aspect}?from&to`, status: r.status, headers: r.headers, body: Array.isArray(r.body) ? r.body.slice(0, 5) : r.body });
  // parameter tests
  for (const q of [{ limit: 3, sort: 'desc' }, { latestValue: 'true' }]) {
    const r2 = await getTs(aspect, { from: from.toISOString(), to: to.toISOString(), ...q });
    console.log('   %s -> HTTP %d, %s', JSON.stringify(q), r2.status, Array.isArray(r2.body) ? r2.body.length + ' records' : JSON.stringify(r2.body).slice(0, 200));
  }
}
