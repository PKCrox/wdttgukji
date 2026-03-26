#!/usr/bin/env node

import { getRuntimeConfig, assertRuntimeConfig } from './config.js';
import { RuntimeStore } from './db.js';

async function main() {
  const config = getRuntimeConfig();
  assertRuntimeConfig(config);
  const store = new RuntimeStore(config);
  await store.ensureSchema();
  await store.close();
  console.log(JSON.stringify({
    status: 'migrated',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
