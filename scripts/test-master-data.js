// Phase B group 4 (GET only after token): OEE master data lists and their nested lists.
// For each list, call it, then call the nested endpoint for the first item (or the item used by B2 Line / GT4).
// Run: node scripts/test-master-data.js
import { cfg, getToken, apiGet } from './lib-ih.js';
import { probe, mask } from './lib-probe.js';

const tok = await getToken();
const oee = cfg.oeePath;
const t = tok.token;
const assets = (await apiGet(`${oee}/assets`, t)).body;
const cfgOf = async (n) => (await apiGet(`${oee}/assets/${assets.find((a) => a.name === n).assetId}/config`, t)).body;
const b2 = await cfgOf('B2 Line');
const gt4 = await cfgOf('GT4');

const firstId = (r, ...keys) => {
  const b = r.body;
  const list = Array.isArray(b) ? b : Object.values(b ?? {}).find(Array.isArray);
  const it = list?.[0];
  return it ? keys.map((k) => it[k]).find(Boolean) : undefined;
};
const idOf = (r, pred) => {
  const b = r.body;
  const list = Array.isArray(b) ? b : Object.values(b ?? {}).find(Array.isArray) ?? [];
  return list.find(pred)?.id;
};

console.log('== lists and nested lists ==');

let r = await probe('/calendars', `${oee}/calendars`, t, { sample: 'oee_calendars.json' });
const calId = gt4.calendarId || b2.calendarId;
await probe('/calendars/{id}', `${oee}/calendars/${calId}`, t, { sample: 'oee_calendar_item.json', names: false });
await probe('/calendars/{id}/calendarEvents', `${oee}/calendars/${calId}/calendarEvents`, t, { query: { from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }, sample: 'oee_calendar_events.json' });

r = await probe('/timeModel', `${oee}/timeModel`, t, { sample: 'oee_timemodel.json' });
const tmId = firstId(r, 'id', 'timeModelId');
if (tmId) await probe('/timeModel/{id}/categories', `${oee}/timeModel/${tmId}/categories`, t, { sample: 'oee_timemodel_categories.json' });

r = await probe('/productCollections', `${oee}/productCollections`, t, { sample: 'oee_productcollections.json' });
const pcId = gt4.productCollectionId || b2.productCollectionId;
await probe('/productCollections/{id}', `${oee}/productCollections/${pcId}`, t, { sample: 'oee_productcollection_item.json', names: false });
await probe('/productCollections/{id}/products', `${oee}/productCollections/${pcId}/products`, t, { sample: 'oee_products.json' });

await probe('/productUnits', `${oee}/productUnits`, t, { sample: 'oee_productunits.json' });
r = await probe('/qualityCodes', `${oee}/qualityCodes`, t, { sample: 'oee_qualitycodes.json' });

r = await probe('/measureCollections', `${oee}/measureCollections`, t, { sample: 'oee_measurecollections.json' });
const mcId = gt4.measureCollectionId || firstId(r, 'id');
if (mcId) await probe('/measureCollections/{id}/measures', `${oee}/measureCollections/${mcId}/measures`, t, { sample: 'oee_measures.json' });

r = await probe('/rejectReasonCollections', `${oee}/rejectReasonCollections`, t, { sample: 'oee_rejectreasoncollections.json' });
const rrcId = gt4.rejectReasonCollectionId || b2.rejectReasonCollectionId;
await probe('/rejectReasonCollections/{id}/rejectReasons', `${oee}/rejectReasonCollections/${rrcId}/rejectReasons`, t, { sample: 'oee_rejectreasons.json' });

r = await probe('/stateTables', `${oee}/stateTables`, t, { sample: 'oee_statetables.json' });
const stId = b2.stateSource?.stateTableId || firstId(r, 'id');
if (stId) await probe('/stateTables/{id}/states', `${oee}/stateTables/${stId}/states`, t, { sample: 'oee_states.json' });

r = await probe('/expressions', `${oee}/expressions`, t, { sample: 'oee_expressions.json' });
const exId = firstId(r, 'id');
if (exId) await probe('/expressions/{id}', `${oee}/expressions/${exId}`, t, { sample: 'oee_expression_item.json', names: false, show: 500 });

await probe('/operands', `${oee}/operands`, t, { sample: 'oee_operands.json' });
await probe('/microStops', `${oee}/microStops`, t, { sample: 'oee_microstops.json', show: 300 });
await probe('/application/settings', `${oee}/application/settings`, t, { sample: 'oee_application_settings.json', show: 600 });
