// A fake Insights Hub for offline flow tests. Synthetic data only, no network.
// makeMockFetch(scenario) returns a fetch-like function. The scenarios:
//   ok            two assets with data, one unconfigured, one under Test Line
//   unmapped      a KPI without a column and a missingMapping entry
//   not-finished  one more asset answers 400 "configuration not finished"
//   no-data       one more asset answers with an empty result list
//   token-fail, list-fail, empty, only-unconfigured
//   details-fail, kpi-fail, stops-fail, stops-paged   (each fails asset A1)
export const SCENARIOS = [
  'ok',
  'unmapped',
  'not-finished',
  'no-data',
  'token-fail',
  'list-fail',
  'empty',
  'only-unconfigured',
  'details-fail',
  'kpi-fail',
  'stops-fail',
  'stops-paged'
];

const HOUR = 3600000;
const hex = (c) => c.repeat(32);
const ASSETS = {
  A1: { id: hex('a'), name: 'Mock Line A', manual: false, path: ['mock-tenant', 'EU', 'Site1', 'Bottles'] },
  A2: { id: hex('b'), name: 'Mock Line B', manual: true, path: ['mock-tenant', 'EU', 'Site1', 'Blisters'] },
  A3: { id: hex('c'), name: 'Mock Line C', manual: false, path: ['mock-tenant', 'EU', 'Site2', 'Tubes'], unconfigured: true },
  A4: { id: hex('d'), name: 'Mock Rig', manual: false, path: ['mock-tenant', 'EU', 'Site1', 'Test Line'] },
  A5: { id: hex('e'), name: 'Mock Line E', manual: false, path: ['mock-tenant', 'EU', 'Site1', 'Pouches'] },
  A6: { id: hex('f'), name: 'Mock Line F', manual: false, path: ['mock-tenant', 'EU', 'Site1', 'Caps'] }
};

function assetsFor(scenario) {
  if (scenario === 'empty') return [];
  if (scenario === 'only-unconfigured') return [ASSETS.A3];
  const list = [ASSETS.A1, ASSETS.A2, ASSETS.A3, ASSETS.A4];
  if (scenario === 'not-finished') list.push(ASSETS.A5);
  if (scenario === 'no-data') list.push(ASSETS.A6);
  return list;
}

function kpiBody(asset, scenario, fromIso) {
  const start = Date.parse(fromIso);
  const hours = Array.from({ length: 24 }, (_, i) => new Date(start + i * HOUR).toISOString());
  const series = (name, f) => ({
    name,
    groups: hours.map((time, i) => ({ time, value: f(i) }))
  });
  const results = [
    series('OEE', (i) => (i % 5 === 0 ? null : 0.4 + i / 100)),
    series('Availability', (i) => 0.5 + i / 100),
    series('Performance', () => 2.17),
    series('Quality', (i) => (i === 3 ? '' : 0.98)),
    series('TEEP', (i) => i / 50),
    series('Total time', (i) => (i === 7 ? HOUR + 0.4 : HOUR)),
    series('Good parts', (i) => (asset.manual ? i * 10 + 0.5 : i * 100)),
    series('Total parts', (i) => i * 110),
    series('Rejected parts', (i) => i * 10),
    series('Planned stops', (i) => (i % 2 ? 1200000.6 : 0)),
    series('MTTR', (i) => (i === 0 ? null : 15000.25)),
    series('Downtime (duration)', (i) => i * 1000),
    series('Micro stops (occurrence)', (i) => i % 3)
  ];
  // an hour that only some KPIs report on
  results[1].groups.pop();
  const body = { productUnit: 'pcs', results };
  if (scenario === 'unmapped' && asset === ASSETS.A1) {
    results.push(series('Mystery KPI', () => 1));
    body.missingMapping = [{ operand: 'Mock operand' }];
  }
  return body;
}

function stopsBody(asset, scenario, fromIso) {
  const start = Date.parse(fromIso);
  const at = (minutes) => new Date(start + minutes * 60000).toISOString();
  const rows = [
    { from: at(0), to: at(5), reason: 'Start of day', reasonFullPath: 'Unplanned / Other', duration: 300000, lossTime: 300000, occurrence: 1, commentCount: 0, overwritten: false },
    { from: at(70), to: at(95), reason: 'Jam', reasonFullPath: 'Unplanned / Mechanical / Jam', duration: 1500000.4, lossTime: 1200000, occurrence: 2, commentCount: '3', overwritten: true },
    { from: at(200), to: at(230), reason: 'Cleaning', reasonFullPath: 'Planned Downtime / Cleaning', duration: 1800000, lossTime: 0, occurrence: 1, commentCount: 0, overwritten: null },
    { from: at(300), to: at(301), reason: '##MICROSTOPS##', duration: 60000, lossTime: 60000, occurrence: 4 },
    { from: at(400), reason: 'Open stop', reasonFullPath: 'Planned Maintenance / Service / Oil', duration: null, lossTime: null, occurrence: null },
    { from: at(24 * 60), to: at(24 * 60 + 5), reason: 'After the day', reasonFullPath: 'Unplanned / Other', duration: 300000, lossTime: 300000 },
    { from: at(-30), to: at(-5), reason: 'Before the day', reasonFullPath: 'Unplanned / Other', duration: 1500000, lossTime: 1500000 }
  ];
  const picked = asset.manual ? rows.slice(0, 3) : rows;
  const page = { totalPages: scenario === 'stops-paged' && asset === ASSETS.A1 ? 2 : 1, totalElements: picked.length };
  return { page, _embedded: { downtimeReasons: picked } };
}

export function makeMockFetch(scenario = 'ok') {
  const reply = (status, body) => ({
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body))
  });
  return async (url, init = {}) => {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname);
    if (path === '/oauth/token') {
      return scenario === 'token-fail' ? reply(401, { error: 'unauthorized' }) : reply(200, { access_token: 'mock-token', token_type: 'bearer', expires_in: 1799 });
    }
    if (init.headers.Authorization !== 'Bearer mock-token') return reply(403, { error: 'forbidden' });
    if (path === '/api/oee/v3/assets') {
      if (scenario === 'list-fail') return reply(500, { error: 'boom' });
      return reply(200, assetsFor(scenario).map((a) => ({ assetId: a.id, name: a.name, isManual: a.manual, isConfigured: !a.unconfigured })));
    }
    const detail = path.match(/^\/api\/assetmanagement\/v3\/assets\/(\w+)$/);
    if (detail) {
      const asset = Object.values(ASSETS).find((a) => a.id === detail[1]);
      if (scenario === 'details-fail' && asset === ASSETS.A1) return reply(404, { error: 'not found' });
      return reply(200, { name: asset.name, hierarchyPath: asset.path.map((name) => ({ name })) });
    }
    if (path === '/api/oee/v3/expressions/evaluateKPIs') {
      const body = JSON.parse(init.body);
      const asset = Object.values(ASSETS).find((a) => a.id === body.assetId);
      if (scenario === 'kpi-fail' && asset === ASSETS.A1) return reply(500, { error: 'boom' });
      if (asset === ASSETS.A5) return reply(400, { message: 'Asset configuration not finished' });
      if (asset === ASSETS.A6) return reply(200, { productUnit: 'pcs', results: [] });
      return reply(200, kpiBody(asset, scenario, body.scope.from));
    }
    const stops = path.match(/^\/api\/oee\/v3\/assets\/(\w+)\/downtimeReasons$/);
    if (stops) {
      const asset = Object.values(ASSETS).find((a) => a.id === stops[1]);
      if (scenario === 'stops-fail' && asset === ASSETS.A1) return reply(500, { error: 'boom' });
      return reply(200, stopsBody(asset, scenario, u.searchParams.get('from')));
    }
    return reply(404, { error: `mock has no route for ${path}` });
  };
}
