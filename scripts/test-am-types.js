// Phase B group 5 (GET only after token): Asset Management asset types and aspect types.
// Run: node scripts/test-am-types.js
import { getToken, apiGet, saveSample } from './lib-ih.js';
import { probe, shape, mask } from './lib-probe.js';

const AM = '/api/assetmanagement/v3';
const HAL = { accept: 'application/hal+json' };
const tok = await getToken();
const t = tok.token;

// find 02 Filler (B2 Line) and GT4 (OEE one) to take real type IDs from
const all = [];
for (let p = 0; p < 5; p++) {
  const r = await apiGet(`${AM}/assets`, t, { query: { size: 200, page: p }, ...HAL });
  all.push(...r.body._embedded.assets);
  if (p + 1 >= r.body.page.totalPages) break;
}
const line = all.find((a) => a.name === 'B2 Line');
const filler = all.find((a) => a.parentId === line.assetId && a.name === '02 Filler');
const gt4 = all.find((a) => a.name === 'GT4' && a.typeId.endsWith('GT4_Equipment'));
console.log('typeIds: 02 Filler=%s | GT4=%s | B2 Line=%s', filler.typeId, gt4.typeId, line.typeId);

console.log('\n== asset types ==');
const types = await probe('GET /assettypes?size=200', `${AM}/assettypes`, t, { query: { size: 200 }, ...HAL, sample: 'am_assettypes_page0.json', shapeLen: 700 });
console.log('page info:', JSON.stringify(types.body.page));
const tl = types.body._embedded?.assetTypes ?? [];
console.log('first ids:', tl.slice(0, 8).map((x) => x.id).join(' | '));
const own = tl.filter((x) => x.id.startsWith(filler.typeId.split('.')[0] + '.'));
console.log('types owned by this tenant (prefix %s): %d', filler.typeId.split('.')[0], own.length);

for (const [label, id] of [['02 Filler type', filler.typeId], ['GT4 type', gt4.typeId], ['B2 Line type', line.typeId]]) {
  const r = await probe(`GET /assettypes/{id} (${label})`, `${AM}/assettypes/${id}`, t, { ...HAL, sample: `am_assettype_${label.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.json`, names: false, shapeLen: 900 });
  if (r.status === 200) {
    console.log('   name=%s parentTypeId=%s instantiable=%s scope=%s', r.body.name, r.body.parentTypeId, r.body.instantiable, r.body.scope);
    console.log('   aspects:', (r.body.aspects ?? []).map((a) => `${a.name}(${(a.aspectTypeId || '').split('.').pop()})`).join(', '));
    console.log('   variables:', (r.body.variables ?? []).length);
  }
}

console.log('\n== aspect types ==');
const at = await probe('GET /aspecttypes?size=200', `${AM}/aspecttypes`, t, { query: { size: 200 }, ...HAL, sample: 'am_aspecttypes_page0.json', shapeLen: 700 });
console.log('page info:', JSON.stringify(at.body.page));
const fillerType = (await apiGet(`${AM}/assettypes/${filler.typeId}`, t, HAL)).body;
for (const asp of (fillerType.aspects ?? []).filter((a) => /OEE_Prerequisites|OEE_MachineState/.test(a.name))) {
  const r = await probe(`GET /aspecttypes/{id} (${asp.name})`, `${AM}/aspecttypes/${asp.aspectTypeId}`, t, { ...HAL, sample: `am_aspecttype_${asp.name.toLowerCase()}.json`, names: false, shapeLen: 700 });
  if (r.status === 200) console.log('   name=%s category=%s scope=%s | variables: %s', r.body.name, r.body.category, r.body.scope, (r.body.variables ?? []).map((v) => `${v.name}:${v.dataType}${v.unit ? '(' + v.unit + ')' : ''}${v.qualityCode ? '+qc' : ''}`).join(', '));
}
