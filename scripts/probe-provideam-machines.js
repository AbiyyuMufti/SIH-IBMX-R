import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request, saveSample } from './provideam-client.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targets = JSON.parse(
  await readFile(resolve(root, 'samples/provideam/probe-targets.json'), 'utf8'),
);
const plantData = JSON.parse(
  await readFile(resolve(root, 'samples/provideam/hierarchy-plants.json'), 'utf8'),
);
const targetPlants = new Set(['hull', 'nottingham', 'weinheim']);
const visiblePlants = plantData.plants.filter((plant) =>
  targetPlants.has(String(plant.name).trim().toLowerCase()),
);
const hullPlantIndex = visiblePlants.findIndex(
  (plant) => String(plant.name).trim().toLowerCase() === 'hull',
);
if (hullPlantIndex < 0) {
  throw new Error('Hull is not present in the saved visible plant list');
}
const sampleFiles = (await readdir(resolve(root, 'samples/provideam')))
  .filter((name) =>
    name.startsWith(`hierarchy-plant-${hullPlantIndex}-area-`) &&
    name.includes('-machines-page-') &&
    name.endsWith('.json'),
  );
const hierarchyMachines = [];

async function readSavedSample(name) {
  const path = resolve(root, `samples/provideam/${name}.json`);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

for (const name of sampleFiles) {
  const sample = JSON.parse(
    await readFile(resolve(root, `samples/provideam/${name}`), 'utf8'),
  );
  if (Array.isArray(sample.machines)) {
    hierarchyMachines.push(...sample.machines);
  }
}

function machineFor(target) {
  const machine = hierarchyMachines.find(
    (candidate) => String(candidate.id) === String(target.id),
  );
  if (!machine) {
    throw new Error('A selected Hull machine is missing from the hierarchy');
  }
  return machine;
}

function requireSuccess(response, path) {
  if (!response.ok) {
    throw new Error(`Provideam ${path} failed with HTTP ${response.status}`);
  }
  return response.data;
}

async function callAndSave(name, method, path, query) {
  const saved = await readSavedSample(name);
  if (saved) {
    return requireSuccess(saved.response, path);
  }
  const response = await request(method, path, { query });
  await saveSample(name, {
    request: { method, path, query },
    response,
  });
  return requireSuccess(response, path);
}

async function getPages(prefix, path, query, recordsKey) {
  let skip = 0;
  let pageNumber = 0;
  const pageSize = 100;

  while (true) {
    const pageQuery = { ...query, Skip: skip, Take: pageSize };
    const sampleName = `${prefix}-page-${pageNumber}`;
    const saved = await readSavedSample(sampleName);
    const response = saved?.response ??
      await request('GET', path, { query: pageQuery });
    const data = requireSuccess(response, path);
    const records = data?.[recordsKey];
    const emptyResult =
      records == null && Number(data?.totalRowCount) === 0;
    if (!Array.isArray(records) && !emptyResult) {
      throw new Error(`Provideam ${path} response has invalid ${recordsKey}`);
    }
    if (!saved) {
      await saveSample(sampleName, {
        request: { method: 'GET', path, query: pageQuery },
        response,
      });
    }

    const count = records?.length ?? 0;
    const total = Number(data?.totalRowCount);
    if (count === 0 || count < pageSize) {
      break;
    }
    if (Number.isFinite(total) && skip + count >= total) {
      break;
    }
    skip += count;
    pageNumber += 1;
  }
}

const modeTypesPath = '/api/v1/mode/getmodetypes';
const modeTypesSample = await readSavedSample('mode-types');
if (!modeTypesSample) {
  const modeTypesResponse = await request('GET', modeTypesPath);
  requireSuccess(modeTypesResponse, modeTypesPath);
  await saveSample('mode-types', {
    request: { method: 'GET', path: modeTypesPath },
    response: modeTypesResponse,
  });
}

for (const [index, target] of targets.machines.entries()) {
  const slot = `machine-${index + 1}`;
  const machine = machineFor(target);
  const machineId = target.id;
  const getCalls = [
    {
      suffix: 'settings',
      path: '/api/v1/machine/getmachinesettings',
      query: { machineID: machineId },
    },
    {
      suffix: 'modes',
      path: '/api/v1/machine/getmodes',
      query: { MachineID: machineId, Skip: 0, Take: 1000 },
    },
    {
      suffix: 'mode-groups',
      path: '/api/v1/machine/getmodegroups',
      query: { MachineID: machineId },
    },
    {
      suffix: 'mode-subgroups',
      path: '/api/v1/machine/getmodesubgroups',
      query: { MachineID: machineId },
    },
    {
      suffix: 'current-values',
      path: '/api/v1/machine/getmachinecurrentvalues',
      query: { machineID: machineId },
    },
    {
      suffix: 'shifts',
      path: '/api/v1/machine/getshifts',
      query: { machineId: machineId },
    },
    {
      suffix: 'production-shifts',
      path: '/api/v1/machine/getprodshifts',
      query: { machineId: machineId },
    },
    {
      suffix: 'shift-start-date',
      path: '/api/v1/shift/getshiftstartdate',
      query: { machineId: machineId },
    },
  ];

  for (const call of getCalls) {
    await callAndSave(
      `${slot}-${call.suffix}`,
      'GET',
      call.path,
      call.query,
    );
  }

  if (machine.shiftProfId !== undefined && machine.shiftProfId !== null) {
    await callAndSave(
      `${slot}-shift-profile`,
      'GET',
      '/api/v1/shift/getshift',
      { shiftProfileId: machine.shiftProfId },
    );
  } else {
    throw new Error('Selected Hull machine has no shift profile ID');
  }

  await getPages(
    `${slot}-parts`,
    '/api/v1/machine/getmachineparts',
    { MachineID: machineId },
    'machineParts',
  );
  await getPages(
    `${slot}-tools`,
    '/api/v1/machine/getmachinetools',
    { MachineID: machineId },
    'machinesTools',
  );
  await getPages(
    `${slot}-stations`,
    '/api/v1/machine/getmachinestations',
    { MachineID: machineId },
    'machineStations',
  );
  await getPages(
    `${slot}-scheduled-downtimes`,
    '/api/v1/machine/getmachineschdowntimes',
    { MachineID: machineId },
    'machineSchDowntimes',
  );
}

const dictionaryPath = '/api/v1/dictionary/get';
const dictionaryResponse = await request('GET', dictionaryPath);
requireSuccess(dictionaryResponse, dictionaryPath);
await saveSample('dictionary', {
  request: { method: 'GET', path: dictionaryPath },
  response: dictionaryResponse,
});

console.log('Saved machine-level GET samples for two Hull machines.');
