// Probe: where do product, order, design speed and time categories come from?
// Reads B2 Line (connected) and GT4 (manual). GET only, plus two read-style
// POSTs the user approved before: evaluateKPIs and timeModelCategoryDistribution.
// Run: node scripts/test-product-order.js [YYYY-MM-DD]   (needs .env)
// Prints counts and names to the console; samples go to samples/ (git-ignored).
import { cfg, getToken, apiGet, saveSample } from './lib-ih.js';

const oee = cfg.oeePath;
const DAY_MS = 86400000;
const tok = await getToken();
const assets = (await apiGet(`${oee}/assets`, tok.token)).body;
const find = (name) => assets.find((a) => a.name === name);
const iso = (ms) => new Date(ms).toISOString();

async function post(path, body) {
  const res = await fetch(cfg.gateway + oee + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

const title = (t) => console.log(`\n=== ${t} ===`);
const short = (v, n = 160) => JSON.stringify(v).slice(0, n);

// 1. Sources and product collection of each asset
const info = {};
for (const name of ['B2 Line', 'GT4']) {
  title(`1. Sources of ${name}`);
  const a = find(name);
  if (!a) {
    console.log('asset not found');
    continue;
  }
  info[name] = { id: a.assetId };
  for (const part of ['orderSource', 'productSource', 'designSpeedSource']) {
    const r = await apiGet(`${oee}/assets/${a.assetId}/${part}`, tok.token);
    const b = r.body || {};
    console.log(`${part}: HTTP ${r.status} mode=${b.mode} keys=${Object.keys(b)}`);
    if (b.source) {
      console.log('   source:', short(b.source, 260));
    }
    saveSample(`probe_${name.replace(/\W+/g, '_')}_${part}.json`, r.body);
  }
  const pc = await apiGet(`${oee}/assets/${a.assetId}/productCollection`, tok.token);
  const pcId = pc.body && pc.body.productCollectionId;
  console.log('productCollection: HTTP', pc.status, pcId ? 'id found' : short(pc.body));
  if (pcId) {
    const list = await apiGet(`${oee}/productCollections/${pcId}/products`, tok.token);
    const arr = list.body.products || list.body;
    console.log(`products: HTTP ${list.status}, ${arr.length} items`);
    console.log('   fields:', Object.keys(arr[0] || {}).join(', '));
    arr.slice(0, 3).forEach((p) => console.log('   ', short(p, 220)));
    saveSample(`probe_${name.replace(/\W+/g, '_')}_products.json`, arr.slice(0, 5));
  }
}

// 2. Which days had products and orders on B2 Line (filterValues per day)
title('2. filterValues per day, B2 Line');
const b2 = info['B2 Line'];
let day = process.argv[2];
const perDay = [];
const end = Date.now();
for (let i = 14; i >= 1; i--) {
  const d0 = Date.parse(iso(end).slice(0, 10) + 'T06:00:00.000Z') - i * DAY_MS;
  const r = await apiGet(`${oee}/assets/${b2.id}/filterValues`, tok.token, {
    query: { from: iso(d0), to: iso(d0 + DAY_MS) },
  });
  const fv = (r.body && r.body.filterValues) || [];
  const get = (k) => (fv.find((x) => x.key === k) || { value: [] }).value;
  const row = { day: iso(d0).slice(0, 10), orders: get('order').length, products: get('product').length };
  perDay.push(row);
  console.log(`${row.day}: HTTP ${r.status}, orders ${row.orders}, products ${row.products}`);
  if (!day && row.products > 0) {
    day = row.day;
  }
}
console.log('day used for the next steps:', day || 'none');

// 3. Which hours belong to which product (evaluateKPIs with a filter)
if (day) {
  title(`3. Hours per product on ${day}, B2 Line`);
  const from = Date.parse(`${day}T06:00:00.000Z`);
  const fv = (
    await apiGet(`${oee}/assets/${b2.id}/filterValues`, tok.token, {
      query: { from: iso(from), to: iso(from + DAY_MS) },
    })
  ).body.filterValues;
  const products = (fv.find((x) => x.key === 'product') || { value: [] }).value;
  const orders = (fv.find((x) => x.key === 'order') || { value: [] }).value;
  console.log(`${products.length} products, ${orders.length} orders`);
  const hoursOf = async (key, value) => {
    const r = await post('/expressions/evaluateKPIs', {
      assetId: b2.id,
      scope: {
        from: iso(from),
        to: iso(from + DAY_MS),
        filter: [
          { key: 'PRODUCT', value: key === 'PRODUCT' ? [value] : [] },
          { key: 'ORDER', value: key === 'ORDER' ? [value] : [] },
          { key: 'SHIFT', value: [] },
        ],
        recursive: false,
        groupedByDateTime: true,
      },
    });
    if (r.status !== 200) {
      return { status: r.status, hours: [] };
    }
    const good = (r.body.results || []).find((x) => x.name === 'Good parts');
    const hours = ((good && good.groups) || [])
      .filter((g) => Number(g.value) > 0)
      .map((g) => g.time);
    return { status: r.status, hours };
  };
  const seen = {};
  for (const [key, values] of [['PRODUCT', products], ['ORDER', orders]]) {
    for (const v of values.slice(0, 12)) {
      const r = await hoursOf(key, v);
      console.log(`${key} "${v}": HTTP ${r.status}, hours with good parts ${r.hours.length}`);
      r.hours.forEach((h) => {
        seen[`${key}|${h}`] = (seen[`${key}|${h}`] || 0) + 1;
      });
    }
    const overlap = Object.keys(seen).filter((k) => k.startsWith(key) && seen[k] > 1);
    console.log(`${key}: hours claimed by more than one value: ${overlap.length}`);
  }
}

// 4. Product and order per shift entry on GT4 (manual)
title('4. manualInputs on GT4, last 60 days');
const gt4 = info.GT4;
if (gt4) {
  const r = await apiGet(`${oee}/assets/${gt4.id}/manualInputs`, tok.token, {
    query: { from: iso(end - 60 * DAY_MS), to: iso(end) },
  });
  const arr = Array.isArray(r.body) ? r.body : r.body.manualInputs || [];
  console.log(`HTTP ${r.status}, ${arr.length} entries`);
  arr.forEach((e) => {
    console.log(`   ${e.startTime} order=${e.order} product=${e.productName} good=${e.good}`);
  });
}

// 5. Time categories of one day (POST, approved read call)
title('5. timeModelCategoryDistribution');
const probeDay = day || iso(end - DAY_MS).slice(0, 10);
const f0 = Date.parse(`${probeDay}T06:00:00.000Z`);
for (const name of ['B2 Line', 'GT4']) {
  if (!info[name]) {
    continue;
  }
  const r = await post(`/assets/${info[name].id}/timeModelCategoryDistribution`, {
    from: iso(f0),
    to: iso(f0 + DAY_MS),
    filter: [{ key: 'PRODUCT', value: [] }, { key: 'ORDER', value: [] }],
    force: true,
  });
  const seg = (r.body && r.body.distribution) || [];
  console.log(`${name}: HTTP ${r.status}, ${seg.length} segments`);
  const count = {};
  seg.forEach((s) => {
    const k = `${s.timeModelName} / ${s.timeCategoryName} / ${s.stateName} / ${s.reason}`;
    count[k] = (count[k] || 0) + 1;
  });
  Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .forEach(([k, n]) => console.log(`   ${n} x ${k}`));
  saveSample(`probe_${name.replace(/\W+/g, '_')}_timemodel.json`, {
    status: r.status,
    first: seg.slice(0, 5),
  });
}

// 6. Reason tree of both assets: do reasons carry a time category?
title('6. Reason tree fields');
for (const name of ['B2 Line', 'GT4']) {
  const a = find(name);
  if (!a || !a.reasonTreeId) {
    console.log(name, 'no reasonTreeId');
    continue;
  }
  const r = await apiGet(`${oee}/reasontrees/${a.reasonTreeId}`, tok.token);
  console.log(`${name} tree: HTTP ${r.status}, keys ${Object.keys(r.body || {})}`);
  const rs = await apiGet(`${oee}/reasontrees/${a.reasonTreeId}/reasons`, tok.token);
  const arr = rs.body.reasons || [];
  console.log(`   reasons ${arr.length}, fields ${Object.keys(arr[0] || {})}`);
  saveSample(`probe_${name.replace(/\W+/g, '_')}_tree.json`, {
    tree: r.body,
    reasons: arr.slice(0, 5),
  });
}
console.log('\nDone.');
