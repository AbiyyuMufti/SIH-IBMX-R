// Phase B group 3/4 (GET only after token): remaining per-asset reports and per-asset setup reads,
// on B2 Line (automatic) and GT4 (manual). Run: node scripts/test-asset-reports.js
import { cfg, getToken } from './lib-ih.js';
import { probe } from './lib-probe.js';

const tok = await getToken();
const oee = cfg.oeePath;
const list = (await (await import('./lib-ih.js')).apiGet(`${oee}/assets`, tok.token)).body;
const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();
const range = { from: iso(now - 7 * 864e5), to: iso(now) };

for (const name of ['B2 Line', 'GT4']) {
  const a = list.find((x) => x.name === name);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  console.log('\n################ %s (7 days: %s to %s)', name, range.from, range.to);

  console.log('\n-- reports with from/to --');
  for (const p of ['downtimeDistribution', 'statusDistribution', 'filterValues', 'measure']) {
    await probe(`/${p}`, `${oee}/assets/${a.assetId}/${p}`, tok.token, { query: range, sample: `oee_${p}_${slug}.json`, names: false });
  }

  console.log('\n-- per-asset setup reads (no params) --');
  for (const p of ['calendar', 'productCollection', 'rejectReasonCollection', 'orderSource', 'productSource', 'designSpeedSource', 'stateTableSource', 'operandInstancesSource']) {
    await probe(`/${p}`, `${oee}/assets/${a.assetId}/${p}`, tok.token, { sample: `oee_${p}_${slug}.json`, names: false, shapeLen: 450 });
  }

  // status-level calls need a statusId from downtimeReasons
  const dr = await probe('/downtimeReasons (for statusId)', `${oee}/assets/${a.assetId}/downtimeReasons`, tok.token, { query: range, names: false, shapeLen: 80 });
  const statusId = dr.body?._embedded?.downtimeReasons?.[0]?.statusId;
  if (statusId) {
    console.log('\n-- status-level calls (statusId from the first downtime reason) --');
    for (const p of ['measureAssignment', 'workorderAssignment']) {
      await probe(`/status/{statusId}/${p}`, `${oee}/assets/${a.assetId}/status/${statusId}/${p}`, tok.token, { sample: `oee_status_${p}_${slug}.json`, names: false });
    }
  } else console.log('\n(no statusId found for %s in the last 7 days, status-level calls skipped)', name);
}
