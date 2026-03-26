#!/usr/bin/env node

import { createClient } from 'redis';
import { getRuntimeConfig, assertRuntimeConfig } from './config.js';
import { RuntimeStore } from './db.js';

async function main() {
  const config = getRuntimeConfig();
  assertRuntimeConfig(config);

  const store = new RuntimeStore(config);
  const redis = createClient({ url: config.redisUrl });
  await store.ensureSchema();
  await redis.connect();
  await redis.ping();
  await redis.quit();
  await store.close();

  console.log(JSON.stringify({
    database: 'ok',
    redis: 'ok',
    queue: config.queueName,
    leaseSeconds: config.leaseSeconds,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
