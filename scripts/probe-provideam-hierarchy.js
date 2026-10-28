import { request, saveSample } from './provideam-client.js';

const targets = new Set(['hull', 'nottingham', 'weinheim']);
const pageSize = 100;

function requireSuccess(response, path) {
  if (!response.ok) {
    throw new Error(`Provideam ${path} failed with HTTP ${response.status}`);
  }
  return response.data;
}

function getRecords(data, key, path) {
  const records = data?.[key];
  if (
    records === null &&
    Number(data?.totalRowCount) === 0
  ) {
    return [];
  }
  if (!Array.isArray(records)) {
    throw new Error(`Provideam ${path} response has no ${key} array`);
  }
  return records;
}

async function getPages(path, query, recordsKey, samplePrefix) {
  const allRecords = [];
  let skip = 0;
  let pageNumber = 0;

  while (true) {
    const response = await request('GET', path, {
      query: {
        ...query,
        Skip: skip,
        Take: pageSize,
      },
    });
    const data = requireSuccess(response, path);
    const records = getRecords(data, recordsKey, path);
    await saveSample(
      `${samplePrefix}-page-${pageNumber}`,
      data,
    );
    allRecords.push(...records);

    const total = Number(data.totalRowCount);
    if (records.length === 0 || records.length < pageSize) {
      break;
    }
    if (Number.isFinite(total) && skip + records.length >= total) {
      break;
    }
    skip += records.length;
    pageNumber += 1;
  }

  return allRecords;
}

const plantsResponse = await request('GET', '/api/v1/plant/getall', {
  query: { Skip: 0, Take: pageSize },
});
const plantsData = requireSuccess(
  plantsResponse,
  '/api/v1/plant/getall',
);
const plants = getRecords(plantsData, 'plants', '/api/v1/plant/getall');
await saveSample('hierarchy-plants', plantsData);

const visiblePlants = plants.filter((plant) =>
  targets.has(String(plant.name).trim().toLowerCase()),
);
const visibleNames = visiblePlants
  .map((plant) => String(plant.name).trim())
  .sort();
console.log(
  `Requested plants visible: ${visibleNames.join(', ') || 'none'}`,
);

for (const [plantIndex, plant] of visiblePlants.entries()) {
  const prefix = `hierarchy-plant-${plantIndex}`;
  const areas = await getPages(
    '/api/v1/area/get',
    { PlantID: plant.id },
    'areas',
    `${prefix}-areas`,
  );
  const workcellsResponse = await request(
    'GET',
    '/api/v1/workcell/get',
    { query: { plantId: plant.id } },
  );
  const workcellsData = requireSuccess(
    workcellsResponse,
    '/api/v1/workcell/get',
  );
  await saveSample(`${prefix}-workcells`, workcellsData);

  for (const [areaIndex, area] of areas.entries()) {
    await getPages(
      '/api/v1/machine/get',
      { AreaID: area.id },
      'machines',
      `${prefix}-area-${areaIndex}-machines`,
    );
  }
}

console.log(
  `Hierarchy samples saved for ${visiblePlants.length} requested plants.`,
);
