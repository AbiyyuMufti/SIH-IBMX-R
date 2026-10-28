import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from './provideam-client.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(root, 'samples/provideam/swagger.json');
const response = await request('GET', '/swagger/v1/swagger.json');
if (!response.ok) {
  throw new Error(`Swagger request failed with HTTP ${response.status}`);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(response.data, null, 2)}\n`,
  'utf8',
);
console.log('Saved Provideam Swagger spec to samples/provideam/swagger.json');
