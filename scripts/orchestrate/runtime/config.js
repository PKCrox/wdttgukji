import path from 'path';

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getRuntimeConfig(env = process.env) {
  return {
    databaseUrl: env.WDTT_RUNTIME_DATABASE_URL || env.DATABASE_URL || null,
    redisUrl: env.WDTT_RUNTIME_REDIS_URL || env.REDIS_URL || null,
    queueName: env.WDTT_RUNTIME_QUEUE || 'wdtt:tasks:ready',
    leaseSeconds: toInt(env.WDTT_RUNTIME_LEASE_SECONDS, 120),
    pollIntervalMs: toInt(env.WDTT_RUNTIME_POLL_MS, 1000),
    dequeueTimeoutSeconds: toInt(env.WDTT_RUNTIME_DEQUEUE_TIMEOUT_SECONDS, 5),
    artifactRoot: path.join(process.cwd(), 'runs', 'durable-runtime'),
    generatedRoot: path.join(process.cwd(), 'scripts', 'orchestrate', 'generated'),
  };
}

export function assertRuntimeConfig(config) {
  if (!config.databaseUrl) {
    throw new Error('Missing WDTT_RUNTIME_DATABASE_URL or DATABASE_URL');
  }
  if (!config.redisUrl) {
    throw new Error('Missing WDTT_RUNTIME_REDIS_URL or REDIS_URL');
  }
}
