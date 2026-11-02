// Writes flows/vfc-config.local.json: the committed Config tab with the
// placeholders filled from .env, ready to import into the VFC. Prints no value.
// .env: IH_PLATFORM, XC_TENANT_ID, RECKITT_API_TECHUSER_CLIENT_ID,
// RECKITT_API_TECHUSER_CLIENT_SECRET, PROVIDEAM_API_KEY.
// Usage: node scripts/make-local-config.js
import { readFileSync, writeFileSync } from 'node:fs';
import { loadEnv } from './lib-ih.js';

loadEnv();
const FILL = {
  platform: ['SET_legacy_OR_xcelerator', 'IH_PLATFORM'],
  xcTenantId: ['PUT_TENANT_ID_HERE', 'XC_TENANT_ID'],
  clientId: ['PUT_CLIENT_ID_HERE', 'RECKITT_API_TECHUSER_CLIENT_ID'],
  clientSecret: ['PUT_CLIENT_SECRET_HERE', 'RECKITT_API_TECHUSER_CLIENT_SECRET'],
  apiKey: ['PUT_PROVIDEAM_API_KEY_HERE', 'PROVIDEAM_API_KEY']
};
const missing = Object.values(FILL).map(([, env]) => env).filter((env) => !process.env[env]);
if (missing.length) {
  throw new Error(`missing in .env: ${missing.join(', ')}`);
}
const url = (f) => new URL(`../flows/${f}`, import.meta.url);
const nodes = JSON.parse(readFileSync(url('vfc-config.json'), 'utf8'));
const config = nodes.find((n) => n.type === 'function' && n.name.startsWith('1.1 CONFIG'));
for (const [field, [placeholder, env]] of Object.entries(FILL)) {
  const from = `${field}: '${placeholder}'`;
  if (!config.func.includes(from)) {
    throw new Error(`placeholder of ${field} not found in vfc-config.json`);
  }
  config.func = config.func.replace(from, () => `${field}: '${process.env[env]}'`);
}
writeFileSync(url('vfc-config.local.json'), JSON.stringify(nodes, null, 2) + '\n');
console.log(`written flows/vfc-config.local.json (${Object.keys(FILL).join(', ')} filled from .env)`);
