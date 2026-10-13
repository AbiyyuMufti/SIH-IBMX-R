// A fake Insights Hub for offline flow tests. Synthetic data only, no network.
// makeMockFetch(scenario) returns a fetch-like function. The scenarios:
//   ok            two assets with data, one unconfigured, one under Test Line
//   unmapped      a KPI without a column and a missingMapping entry
//   not-finished  one more asset answers 400 "configuration not finished"
//   no-data       one more asset answers with an empty result list
//   token-fail, list-fail, empty, only-unconfigured
//   details-fail, kpi-fail, kpi-413, stops-fail, stops-paged   (each fails asset A1)
//   kpi-413 answers with the real limit text: Too many status changes
//   ref-config-fail  A1 config and thresholds answer 500 (reference flows)
//   ref-detail-fail  the first tree, collection and calendar answer 500
//   products      products and orders on A1 and A2 (filterValues, filtered KPIs)
//   values-fail, products-fail, value-kpi-fail, no-collection   (A1, with
//                 the products scenario data)
// Every other scenario has no product and no order (empty filterValues).
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
  'kpi-413',
  'stops-fail',
  'stops-paged',
  'ref-config-fail',
  'ref-detail-fail',
  'products',
  'values-fail',
  'products-fail',
  'value-kpi-fail',
  'no-collection'
];

const PRODUCT_SCENARIOS = [
  'products',
  'values-fail',
  'products-fail',
  'value-kpi-fail',
  'no-collection'
];

// Hours (0 to 23 of the production day) in which a value has parts.
const VALUE_HOURS = {
  '1001': [0, 9],
  '1002': [12, 19],
  'O-1': [0, 11],
  'O-2': [12, 23],
  Slow: [2, 5],
  Unknown: [6, 8],
  Odd: [9, 10]
};

// Products and orders of a day per asset (the filterValues answer).
function valuesFor(asset, scenario) {
  if (!PRODUCT_SCENARIOS.includes(scenario)) return { product: [], order: [] };
  if (asset === ASSETS.A1) return { product: ['1001', '1002'], order: ['O-1', 'O-2'] };
  if (asset === ASSETS.A2) return { product: ['Slow', 'Odd', 'Unknown'], order: [] };
  return { product: [], order: [] };
}

function collectionOf(asset, scenario) {
  if (scenario === 'no-collection' && asset === ASSETS.A1) return null;
  if (PRODUCT_SCENARIOS.includes(scenario) && asset === ASSETS.A2) return 'pc-2';
  return asset.pc;
}

// Parts only in the hours of one value (a product or an order).
function restrictTo(body, value) {
  const [a, b] = VALUE_HOURS[value] || [0, -1];
  body.results.forEach((r) => {
    if (r.name !== 'Total parts' && r.name !== 'Good parts') return;
    r.groups.forEach((g, i) => {
      if (i < a || i > b) g.value = 0;
    });
  });
  return body;
}

const HOUR = 3600000;
const hex = (c) => c.repeat(32);
const ASSETS = {
  A1: { id: hex('a'), tree: 'tree-1', cal: 'cal-1', pc: 'pc-1', name: 'Mock Line A', manual: false, path: ['mock-tenant', 'EU', 'Site1', 'Bottles'] },
  A2: { id: hex('b'), tree: 'tree-1', cal: 'cal-1', pc: 'pc-1', name: 'Mock Line B', manual: true, path: ['mock-tenant', 'EU', 'Site1', 'Blisters'] },
  A3: { id: hex('c'), name: 'Mock Line C', manual: false, path: ['mock-tenant', 'EU', 'Site2', 'Tubes'], unconfigured: true },
  A4: { id: hex('d'), tree: 'tree-2', cal: 'cal-2', pc: 'pc-2', name: 'Mock Rig', manual: false, path: ['mock-tenant', 'EU', 'Site1', 'Test Line'] },
  A5: { id: hex('e'), tree: 'tree-2', cal: 'cal-2', pc: 'pc-2', name: 'Mock Line E', manual: false, path: ['mock-tenant', 'EU', 'Site1', 'Pouches'] },
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
  // The product scenarios also have an operational time (30 min per hour).
  if (PRODUCT_SCENARIOS.includes(scenario)) {
    results.push(series('Operational time', () => 1800000));
  }
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


function thresholdsFor(asset) {
  const kpis = ['OEE', 'Availability', 'Performance', 'Quality'];
  if (asset === ASSETS.A2) {
    return { warnings: kpis.map((name) => ({ name, value: 0 })), errors: kpis.map((name) => ({ name, value: 0 })) };
  }
  const shown = asset === ASSETS.A4 ? kpis.slice(0, 3) : kpis;
  return { warnings: shown.map((name) => ({ name, value: 70 })), errors: shown.map((name) => ({ name, value: 30 })) };
}

function reasonsFor(treeId) {
  if (treeId === 'tree-2') {
    return [{ id: 'r-9', name: 'other', description: null, parentId: null, justification: false }];
  }
  return [
    { id: 'r-1', name: 'Breakdown', description: null, parentId: null, justification: false },
    { id: 'r-2', name: 'Mechanical', description: null, parentId: 'r-1', justification: true },
    { id: 'r-3', name: 'Jam', description: 'free text', parentId: 'r-2', justification: false },
    { id: 'r-4', name: 'Planned Downtime', description: null, parentId: null, justification: false }
  ];
}

function productsFor(collectionId) {
  if (collectionId === 'pc-2') {
    return [
      { id: 'p-3', name: 'Slow', code: 'S1', description: null, designSpeedValue: 5.4165, designSpeedUnit: 'Piece', designSpeedInterval: 'HOUR', designSpeedType: 'SPEED' },
      { id: 'p-4', name: 'Odd', code: null, designSpeedValue: 10, designSpeedUnit: 'Piece', designSpeedInterval: 'WEEK', designSpeedType: 'SPEED' }
    ];
  }
  return [
    { id: 'p-1', name: '1001', code: '1001', description: 'mock text', designSpeedValue: 210, designSpeedUnit: 'Piece', designSpeedInterval: 'MINUTE', designSpeedType: 'SPEED' },
    { id: 'p-2', name: '1002', code: '1002', designSpeedValue: 200, designSpeedUnit: 'Piece', designSpeedInterval: 'MINUTE', designSpeedType: 'SPEED' }
  ];
}

function eventsFor(calendarId) {
  const rule = { freq: 'DAILY', interval: 10, dtstart: '2026-09-01T06:00:00Z', until: '2026-12-31T23:59:59Z' };
  if (calendarId === 'cal-2') {
    return [{ id: 'e-3', name: 'Shift 1', description: null, timeModelCategoryId: 'tmc-1', duration: 43200000, rrule: { freq: 'DAILY', interval: 1, dtstart: '2026-09-01T06:00:00Z' } }];
  }
  return [
    { id: 'e-1', name: 'Red', description: 'crew', timeModelCategoryId: 'tmc-1', duration: 43200000, rrule: rule },
    { id: 'e-2', name: 'Changeover', timeModelCategoryId: null, duration: 1800000, rrule: 'FREQ=DAILY' }
  ];
}

export function makeMockFetch(scenario = 'ok') {
  const reply = (status, body) => ({
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body))
  });
  return async (url, init = {}) => {
    const u = new URL(url);
    let path = decodeURIComponent(u.pathname);
    // Two mock platforms. legacy: piam token host + gateway host, plain
    // paths. xcelerator: <10 digits>.eu1.sws.siemens.com token host (form
    // body) + api.eu1.siemens.app, service name + suffix in the path.
    // A token only works on its own platform (legacy host + xcelerator
    // token = 403, xcelerator host + legacy token = 401), as in the tests.
    const legacyToken = /^[a-z0-9-]+\.piam\.eu1\.mindsphere\.io$/.test(u.host);
    const xcToken = /^[0-9]{10}\.eu1\.sws\.siemens\.com$/.test(u.host);
    const legacyApi = u.host === 'gateway.eu1.mindsphere.io';
    const xcApi = u.host === 'api.eu1.siemens.app';
    if (path === '/oauth/token' && (legacyToken || xcToken)) {
      if (scenario === 'token-fail') return reply(401, { error: 'unauthorized' });
      if (legacyToken && u.searchParams.get('grant_type') !== 'client_credentials') {
        return reply(400, { error: 'invalid_request' });
      }
      if (xcToken) {
        const type = (init.headers || {})['Content-Type'];
        const form = init.body === 'grant_type=client_credentials';
        if (type !== 'application/x-www-form-urlencoded' || !form) {
          return reply(400, { error: 'invalid_request' });
        }
      }
      const token = xcToken ? 'mock-token-xc' : 'mock-token';
      return reply(200, { access_token: token, token_type: 'bearer', expires_in: 1799 });
    }
    if (!legacyApi && !xcApi) return reply(404, { error: 'unknown host' });
    const wanted = legacyApi ? 'Bearer mock-token' : 'Bearer mock-token-xc';
    if (init.headers.Authorization !== wanted) {
      return legacyApi ? reply(403, { error: 'forbidden' }) : reply(401, { error: 'unauthorized' });
    }
    if (xcApi) {
      // /api/<service>-1000001700/v3/... becomes /api/<service>/v3/...
      const stripped = path.replace(/^(\/api\/[a-z]+)-1000001700(\/v3\/)/, '$1$2');
      if (stripped === path) return reply(404, { error: 'path without suffix' });
      path = stripped;
    } else if (/^\/api\/[a-z]+-[0-9]+\//.test(path)) {
      return reply(404, { error: 'suffix on the legacy host' });
    }
    if (path === '/api/oee/v3/assets') {
      if (scenario === 'list-fail') return reply(500, { error: 'boom' });
      return reply(200, assetsFor(scenario).map((a) => ({ assetId: a.id, name: a.name, isManual: a.manual, isConfigured: !a.unconfigured, reasonTreeId: a.tree })));
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
      if (scenario === 'kpi-413' && asset === ASSETS.A1) {
        return reply(413, { errors: [{ code: 'tooManyStatusChanges', message: 'Too many status changes (12345)' }] });
      }
      if (asset === ASSETS.A5) return reply(400, { message: 'Asset configuration not finished' });
      if (asset === ASSETS.A6) return reply(200, { productUnit: 'pcs', results: [] });
      const filter = Object.fromEntries((body.scope.filter || []).map((f) => [f.key, f.value]));
      const value = (filter.PRODUCT || [])[0] || (filter.ORDER || [])[0];
      if (value) {
        if (scenario === 'value-kpi-fail' && asset === ASSETS.A1 && value === '1002') return reply(500, { error: 'boom' });
        return reply(200, restrictTo(kpiBody(asset, scenario, body.scope.from), value));
      }
      return reply(200, kpiBody(asset, scenario, body.scope.from));
    }
    const stops = path.match(/^\/api\/oee\/v3\/assets\/(\w+)\/downtimeReasons$/);
    if (stops) {
      const asset = Object.values(ASSETS).find((a) => a.id === stops[1]);
      if (scenario === 'stops-fail' && asset === ASSETS.A1) return reply(500, { error: 'boom' });
      return reply(200, stopsBody(asset, scenario, u.searchParams.get('from')));
    }

    const fv = path.match(/^\/api\/oee\/v3\/assets\/(\w+)\/filterValues$/);
    if (fv) {
      const asset = Object.values(ASSETS).find((a) => a.id === fv[1]);
      if (scenario === 'values-fail' && asset === ASSETS.A1) return reply(500, { error: 'boom' });
      const v = valuesFor(asset, scenario);
      return reply(200, { filterValues: [{ key: 'order', value: v.order }, { key: 'product', value: v.product }, { key: 'shift', value: [] }] });
    }
    const oeeAsset = path.match(/^\/api\/oee\/v3\/assets\/(\w+)(\/config)?$/);
    if (oeeAsset) {
      const asset = Object.values(ASSETS).find((a) => a.id === oeeAsset[1]);
      const failsA1 = scenario === 'ref-config-fail' && asset === ASSETS.A1;
      if (failsA1) return reply(500, { error: 'boom' });
      if (asset.unconfigured) return reply(400, { message: 'Asset configuration not finished' });
      if (oeeAsset[2]) return reply(200, { calendarId: asset.cal, productCollectionId: collectionOf(asset, scenario), hasManuals: asset.manual });
      return reply(200, { assetId: asset.id, thresholds: thresholdsFor(asset) });
    }
    const firstFails = scenario === 'ref-detail-fail';
    if (path === '/api/oee/v3/reasontrees') {
      return reply(200, { reasonTrees: [{ id: 'tree-1', name: 'Mock Tree One' }, { id: 'tree-2', name: 'Mock Tree Two' }, { id: 'tree-9', name: 'Unused Tree' }] });
    }
    const reasons = path.match(/^\/api\/oee\/v3\/reasontrees\/([\w-]+)\/reasons$/);
    if (reasons) {
      if (firstFails && reasons[1] === 'tree-1') return reply(500, { error: 'boom' });
      return reply(200, { reasons: reasonsFor(reasons[1]) });
    }
    if (path === '/api/oee/v3/productCollections') {
      return reply(200, { productCollections: [{ id: 'pc-1', name: 'Mock Products One' }, { id: 'pc-2', name: 'Mock Products Two' }] });
    }
    const products = path.match(/^\/api\/oee\/v3\/productCollections\/([\w-]+)\/products$/);
    if (products) {
      if ((firstFails || scenario === 'products-fail') && products[1] === 'pc-1') return reply(500, { error: 'boom' });
      return reply(200, { products: productsFor(products[1]) });
    }
    if (path === '/api/oee/v3/calendars') {
      return reply(200, [{ id: 'cal-1', name: 'Mock Calendar One', timeZoneText: '(UTC+01:00) Mock' }, { id: 'cal-2', name: 'Mock Calendar Two', timeZoneText: '(UTC+00:00) Mock' }]);
    }
    const events = path.match(/^\/api\/oee\/v3\/calendars\/([\w-]+)\/calendarEvents$/);
    if (events) {
      if (firstFails && events[1] === 'cal-1') return reply(500, { error: 'boom' });
      if (!u.searchParams.get('from') || !u.searchParams.get('to')) return reply(400, { message: 'from and to are required' });
      return reply(200, { calendarEvents: eventsFor(events[1]) });
    }
    return reply(404, { error: `mock has no route for ${path}` });
  };
}
