import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_REQUESTS } from './provideam-client.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specPath = resolve(root, 'samples/provideam/swagger.json');
const outputPath = resolve(
  root,
  'docs/inventory/provideam.swagger.json.md',
);
const verifiedPath = resolve(
  root,
  'samples/provideam/verified-requests.json',
);
const VERIFIED_REQUESTS = new Set(
  existsSync(verifiedPath)
    ? JSON.parse(readFileSync(verifiedPath, 'utf8'))
    : [],
);
const spec = JSON.parse(await readFile(specPath, 'utf8'));
const samplesPath = resolve(root, 'samples/provideam');
const observedErrors = new Map();
for (const name of await readdir(samplesPath)) {
  if (!name.endsWith('-empty-request.json')) {
    continue;
  }
  const sample = JSON.parse(
    await readFile(resolve(samplesPath, name), 'utf8'),
  );
  const { method, path } = sample.request ?? {};
  const status = Number(sample.response?.status);
  if (method && path && status >= 400) {
    observedErrors.set(
      `${String(method).toUpperCase()} ${path}`,
      `HTTP ${status} observed`,
    );
  }
}

function resolveReference(reference) {
  if (!reference?.startsWith('#/')) {
    return null;
  }
  return reference
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((current, part) => current?.[part], spec);
}

function typeName(schema) {
  if (!schema) {
    return 'unspecified';
  }
  if (schema.$ref) {
    return schema.$ref.split('/').at(-1);
  }
  if (schema.type === 'array') {
    return `array<${typeName(schema.items)}>`;
  }
  if (schema.type) {
    return schema.format
      ? `${schema.type} (${schema.format})`
      : schema.type;
  }
  return 'unspecified';
}

function parameterText(parameter) {
  const resolved = parameter.$ref
    ? resolveReference(parameter.$ref)
    : parameter;
  if (!resolved) {
    return 'unresolved parameter reference';
  }
  const required = resolved.required ? ', required' : '';
  return [
    `${resolved.name} (${resolved.in}${required}`,
    `${typeName(resolved.schema)})`,
  ].join(', ');
}

function markdownCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

const lines = [
  '# Provideam Swagger endpoint inventory',
  '',
  'Generated from `samples/provideam/swagger.json` by',
  '`node scripts/helper-swagger-markdown.js`. Status distinguishes verified',
  'live responses, observed HTTP errors from saved request samples, and',
  'inferred-only operations.',
  '',
  '| Method | Path | Tag | Summary | Parameters | Allowlisted | Status |',
  '|---|---|---|---|---|---|---|',
];

const methods = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
]);
const operations = [];

for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!methods.has(method.toLowerCase())) {
      continue;
    }
    const key = `${method.toUpperCase()} ${path}`;
    const parameters = [
      ...(pathItem.parameters ?? []),
      ...(operation.parameters ?? []),
    ];
    operations.push({
      key,
      method: method.toUpperCase(),
      path,
      tag: operation.tags?.join(', ') ?? '',
      summary: operation.summary ?? '',
      parameters: parameters.map(parameterText).join('; '),
      allowlisted: ALLOWED_REQUESTS.has(key) ? 'Yes' : 'No',
      status: VERIFIED_REQUESTS.has(key)
        ? 'verified live'
        : observedErrors.get(key) ?? 'inferred only',
    });
  }
}

operations.sort((left, right) =>
  left.path.localeCompare(right.path) ||
  left.method.localeCompare(right.method),
);

for (const operation of operations) {
  lines.push(
    `| ${operation.method} | \`${operation.path}\` | ` +
    `${markdownCell(operation.tag)} | ${markdownCell(operation.summary)} | ` +
    `${markdownCell(operation.parameters)} | ${operation.allowlisted} | ` +
    `${operation.status} |`,
  );
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${operations.length} operations to docs/inventory/provideam.swagger.json.md`);
