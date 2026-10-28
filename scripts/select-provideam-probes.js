import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveSample } from './provideam-client.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = 'Hull';
const month = '2026-09';
const sourceTypes = [
  'plan_opt',
  'run_rates',
  'volume_loss_correction',
  'line_losses',
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      row.push(field);
      if (row.some((cell) => cell !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (row.length > 0 || field !== '') {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function dayFrom(value) {
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? '';
}

async function loadSourceDays(type) {
  const file = resolve(
    root,
    `sharepoint/source/${type}/site=${site}/${type}_${month}.csv`,
  );
  const rows = parseCsv(await readFile(file, 'utf8'));
  const [header, ...records] = rows;
  const machineIndex = header.indexOf('MachineName');
  const dayIndex = header.findIndex((column) =>
    column.startsWith('YYYY-MM-DD') || column === 'ShiftStartDate',
  );
  if (machineIndex < 0 || dayIndex < 0) {
    throw new Error(`Unexpected columns in the ${type} source`);
  }

  const daysByMachine = new Map();
  for (const record of records) {
    const machine = record[machineIndex] ?? '';
    const day = dayFrom(record[dayIndex]);
    if (!machine || !day) {
      continue;
    }
    const days = daysByMachine.get(machine) ?? new Set();
    days.add(day);
    daysByMachine.set(machine, days);
  }
  return daysByMachine;
}

const targets = new Set(['hull', 'nottingham', 'weinheim']);
const plantData = JSON.parse(
  await readFile(resolve(root, 'samples/provideam/hierarchy-plants.json'), 'utf8'),
);
const visiblePlants = plantData.plants.filter((plant) =>
  targets.has(String(plant.name).trim().toLowerCase()),
);
const hullPlantIndex = visiblePlants.findIndex(
  (plant) => String(plant.name).trim().toLowerCase() === 'hull',
);
if (hullPlantIndex < 0) {
  throw new Error('Hull is not present in the saved visible plant list');
}

const machineFiles = (await readdir(resolve(root, 'samples/provideam')))
  .filter((name) =>
    name.startsWith(`hierarchy-plant-${hullPlantIndex}-area-`) &&
    name.includes('-machines-page-') &&
    name.endsWith('.json'),
  );
const machines = [];
for (const name of machineFiles) {
  const sample = JSON.parse(
    await readFile(resolve(root, `samples/provideam/${name}`), 'utf8'),
  );
  if (Array.isArray(sample.machines)) {
    machines.push(...sample.machines);
  }
}

const sourceDays = new Map();
for (const type of sourceTypes) {
  sourceDays.set(type, await loadSourceDays(type));
}

const machineCandidates = [];
for (const machine of machines) {
  const daySets = sourceTypes.map((type) =>
    sourceDays.get(type).get(machine.name),
  );
  if (daySets.some((days) => !days)) {
    continue;
  }
  const commonDays = [...daySets[0]]
    .filter((day) => daySets.every((days) => days.has(day)))
    .sort();
  if (commonDays.length > 0) {
    machineCandidates.push({
      id: machine.id,
      name: machine.name,
      sourceDays: commonDays,
    });
  }
}

if (machineCandidates.length < 2) {
  throw new Error(
    'Fewer than two Hull machines have a common day in all four source types',
  );
}

const selected = machineCandidates
  .sort((left, right) =>
    right.sourceDays.length - left.sourceDays.length ||
    left.name.localeCompare(right.name),
  )
  .slice(0, 2);
const day = selected[0].sourceDays.find((candidateDay) =>
  selected[1].sourceDays.includes(candidateDay),
);
if (!day) {
  throw new Error('The selected Hull machines have no common source day');
}

await saveSample('probe-targets', {
  site,
  month,
  day,
  sourceTypes,
  machines: selected.map(({ id, name }) => ({
    id,
    name,
  })),
});
console.log(
  `Selected two Hull machines; one day is present in all four source types.`,
);
